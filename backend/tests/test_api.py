import importlib.util
import json
import copy
from pathlib import Path
import pytest
from fastapi.testclient import TestClient

HEAD = {"host":"127.0.0.1:5280", "origin":"https://yang-ss-stack.github.io", "sec-fetch-site":"cross-site"}
FACTS = json.loads(Path(__file__).with_name("valid-facts.json").read_text(encoding="utf-8-sig"))

def setup():
    assert importlib.util.find_spec("linguajet_local.app") is not None, "approved local API is missing"
    from linguajet_local.app import create_app
    from linguajet_local.session import SessionState
    now = [1000.0]
    state = SessionState(clock=lambda: now[0])
    client = TestClient(create_app(state=state))
    return client, state, now

def paired():
    c,s,n = setup()
    r=c.post('/api/v1/session',json={"connectionCode":s.connection_code},headers=HEAD)
    assert r.status_code == 200
    return c,s,n,{**HEAD,"authorization":"Bearer "+r.json()['sessionToken']}

def test_valid_contract_and_exact_response():
    c,s,n,h=paired()
    r=c.post('/api/v1/facts/check',json=FACTS,headers=h)
    assert r.status_code==200
    assert set(r.json())=={'contractVersion','requestId','snapshotToken','factsToken','status','receivedAt'}
    assert r.json()['status']=='validated'

@pytest.mark.parametrize('value',[-1,True,1.0,'1',9007199254740992])
def test_strict_count(value):
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); f['book']['completedWords']=value
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422

@pytest.mark.parametrize('path,value',[(('extra',),'secret'),(('today','learning','remainingWords'),99),(('basis','localDate'),'2026-02-30'),(('basis','snapshotToken'),'ABC'),(('history','today','selfAssessments'),None),(('reviewLoad','outsideTodayTaskCount'),1)])
def test_invalid_contract(path,value):
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); obj=f
    for key in path[:-1]: obj=obj[key]
    obj[path[-1]]=value
    r=c.post('/api/v1/facts/check',json=f,headers=h)
    assert r.status_code==422
    assert 'secret' not in r.text and 'input' not in r.text

@pytest.mark.parametrize('key,value',[('host','localhost:5280'),('origin','https://evil.example'),('sec-fetch-site','same-origin'),('origin',None)])
def test_sources(key,value):
    c,s,n=setup(); h={**HEAD}; h.pop(key)
    if value is not None: h[key]=value
    r=c.get('/api/v1/health',headers=h)
    assert r.status_code==403
    assert ('access-control-allow-origin' in r.headers)==(h.get('origin')==HEAD['origin'])

def test_preflight_and_missing_session():
    c,s,n=setup()
    r=c.options('/api/v1/facts/check',headers={**HEAD,'access-control-request-method':'POST','access-control-request-headers':'authorization, content-type'})
    assert r.status_code==204
    assert 'access-control-allow-credentials' not in r.headers
    assert c.post('/api/v1/facts/check',json=FACTS,headers=HEAD).status_code==401

def test_expiry_replay_restart():
    c,s,n,h=paired()
    assert c.post('/api/v1/session',json={'connectionCode':s.connection_code},headers=HEAD).status_code==401
    n[0]+=43200
    assert c.post('/api/v1/facts/check',json=FACTS,headers=h).json()['error']['code']=='SESSION_EXPIRED'
    other,_,_=setup()
    assert other.post('/api/v1/facts/check',json=FACTS,headers=h).status_code==401

def test_expired_code_and_limits():
    c,s,n=setup(); n[0]+=300
    for _ in range(10): assert c.post('/api/v1/session',json={'connectionCode':s.connection_code},headers=HEAD).status_code==401
    r=c.post('/api/v1/session',json={},headers=HEAD)
    assert r.status_code==429 and int(r.headers['retry-after'])>0

def test_facts_limit_counts_failures():
    c,s,n,h=paired()
    for _ in range(30): assert c.post('/api/v1/facts/check',json={},headers=h).status_code==422
    assert c.post('/api/v1/facts/check',json=FACTS,headers=h).status_code==429

@pytest.mark.parametrize('body,status',[('{"x":1,"x":2}',400),('{"x":NaN}',400),('{',400),(' '*262145,413)], ids=['duplicate','nonfinite','malformed','oversize'])
def test_raw_body(body,status):
    c,s,n,h=paired()
    assert c.post('/api/v1/facts/check',content=body,headers={**h,'content-type':'application/json'}).status_code==status

def test_type_unknown_and_privacy(caplog):
    c,s,n,h=paired()
    assert c.post('/api/v1/facts/check',content='secret',headers=h).status_code==415
    for path in ['/docs','/redoc','/openapi.json','/unknown']:
        r=c.get(path,headers=HEAD); assert r.status_code==404 and r.headers['cache-control']=='no-store'
    assert s.connection_code not in caplog.text and h['authorization'] not in caplog.text


@pytest.mark.parametrize('version',[True,1.0,'1',2])
def test_version_exact_type(version):
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); f['contractVersion']=version
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422

def test_internal_failure_sanitized(caplog):
    c,s,n,h=paired()
    def broken(*args): raise RuntimeError('secret-'+s.connection_code)
    s.limit=broken
    r=c.post('/api/v1/facts/check',json=FACTS,headers=h)
    assert r.status_code==500 and r.json()['error']['code']=='INTERNAL_ERROR'
    assert s.connection_code not in r.text+caplog.text
    assert r.headers['access-control-allow-origin']==HEAD['origin']

def test_no_book_contract():
    c,s,n,h=paired(); f=copy.deepcopy(FACTS)
    f['basis']['selectedWordBookId']=None
    f['book']={'id':None,'label':None,'totalWords':None,'completedWords':0}
    f['reviewLoad']={'wordBookId':None,'dueCount':None,'outsideTodayTaskCount':None,'needsReconciliation':False}
    f['ruleRecommendation']=None
    for period in f['history'].values():
        period['wordBookId']=None
        period['coverage'].update(taskCount=0,tasksWithoutEvents=0)
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==200
    f['history']['today']['choices']['correct']=1
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422

def test_legitimate_conflict_nulls_and_effective_relationship():
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); p=f['history']['today']
    p['selfAssessments']['known']=2; p['corrections']['fromSelfAssessment']=1
    p['effectiveSelfAssessments'].update(known=1,fuzzy=1)
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==200
    p['effectiveSelfAssessments']['known']=2
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422
    p['issues']=['conflicting-event']; p['selfAssessments']=None; p['corrections']=None; p['effectiveSelfAssessments']=None
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==200

@pytest.mark.parametrize('update',[{'tasksWithoutEvents':2},{'legacyTaskCount':2},{'eventCompleteness':'complete'}])
def test_coverage(update):
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); f['history']['today']['coverage'].update(update)
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422

@pytest.mark.parametrize('path,value',[(('history','last7Days','fromDate'),'2026-09-25'),(('book','id'),'b'),(('reviewLoad','wordBookId'),'b'),(('reviewLoad','dueCount'),None),(('history','today','issues'),['duplicate-event','duplicate-event']),(('history','today','completions','learningWords'),None)])
def test_remaining_relations(path,value):
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); obj=f
    for key in path[:-1]: obj=obj[key]
    obj[path[-1]]=value
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422

def test_pair_actual_size_and_boundary():
    c,s,n=setup()
    raw=json.dumps({'connectionCode':s.connection_code})
    assert c.post('/api/v1/session',content=raw+' '*(4097-len(raw)),headers={**HEAD,'content-type':'application/json'}).status_code==413
    assert c.post('/api/v1/session',content=raw+' '*(4096-len(raw)),headers={**HEAD,'content-type':'application/json'}).status_code==200

def test_facts_size_boundary():
    c,s,n,h=paired(); raw=json.dumps(FACTS)
    assert c.post('/api/v1/facts/check',content=raw+' '*(262144-len(raw)),headers={**h,'content-type':'application/json'}).status_code==200

def test_invalid_preflight_and_wrong_bearer():
    c,s,n,h=paired()
    assert c.options('/api/v1/facts/check',headers={**HEAD,'access-control-request-method':'POST','access-control-request-headers':'x-secret'}).status_code==403
    assert c.post('/api/v1/facts/check',json=FACTS,headers={**h,'authorization':'Bearer '+s.connection_code}).status_code==401
    assert c.post('/api/v1/facts/check',json=FACTS,headers={**h,'authorization':'Bearer bad'}).status_code==401

def test_entrypoint_exists():
    assert importlib.util.find_spec('linguajet_local.__main__') is not None, 'fixed socket foreground entrypoint missing'

@pytest.mark.parametrize('code',['bad','!'*43,''])
def test_malformed_code_is_credential_rejection(code):
    c,s,n=setup()
    assert c.post('/api/v1/session',json={'connectionCode':code},headers=HEAD).json()['error']['code']=='CONNECTION_CODE_INVALID'
    assert c.post('/api/v1/session',json={'connectionCode':s.connection_code},headers=HEAD).status_code==200

@pytest.mark.parametrize('body',['{"x":1e999}','{"x":-1e999}'])
def test_overflow_json_number(body):
    c,s,n,h=paired()
    assert c.post('/api/v1/facts/check',content=body,headers={**h,'content-type':'application/json'}).status_code==400

def test_duplicate_source_no_cors():
    c,s,n=setup()
    r=c.get('/api/v1/health',headers=[('host',HEAD['host']),('origin',HEAD['origin']),('origin','https://evil.example'),('sec-fetch-site','cross-site')])
    assert r.status_code==403 and 'access-control-allow-origin' not in r.headers

def test_startup_bind_failure_is_private():
    from linguajet_local.__main__ import main
    import socket
    import unittest.mock
    import io
    fake=unittest.mock.Mock(spec=socket.socket)
    fake.bind.side_effect=OSError('secret')
    stdout,stderr=io.StringIO(),io.StringIO()
    with unittest.mock.patch('linguajet_local.__main__.socket.socket',return_value=fake), unittest.mock.patch('sys.stdout',stdout), unittest.mock.patch('sys.stderr',stderr):
        assert main()==1
    assert stdout.getvalue()=='' and 'secret' not in stderr.getvalue()
    fake.bind.assert_called_once_with(('127.0.0.1',5280))
    fake.close.assert_called_once()

def test_startup_prebind_one_code_one_worker():
    from linguajet_local.__main__ import main
    import socket
    import unittest.mock
    import io
    fake=unittest.mock.Mock(spec=socket.socket); stdout=io.StringIO(); observed={}
    def capture(config):
        observed['config']=config
        assert fake.bind.called and fake.listen.called
        runner=unittest.mock.Mock(); observed['runner']=runner
        return runner
    with unittest.mock.patch('linguajet_local.__main__.socket.socket',return_value=fake),unittest.mock.patch('linguajet_local.__main__.uvicorn.Server',side_effect=capture),unittest.mock.patch('sys.stdout',stdout):
        assert main()==0
    config=observed['config']; state=config.app.state.session
    assert stdout.getvalue().count(state.connection_code)==1
    assert config.workers==1 and config.reload is False and config.access_log is False
    observed['runner'].run.assert_called_once_with(sockets=[fake])

@pytest.mark.parametrize('setting,value',[('examDate',None),('dailyNewWords',None),('dailyReviewWords',None),('dailyStudyMinutes',None)])
def test_recommendation_missing_basis_requires_null(setting,value):
    c,s,n,h=paired(); f=copy.deepcopy(FACTS); f['settings'][setting]=value
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==422
    r=f['ruleRecommendation']
    if setting=='examDate':
        r.update(daysRemaining=None,deadlineDailyWords=None,recommendedDailyWords=None,exceedsDailyWordLimit=None)
    elif setting in ('dailyNewWords','dailyReviewWords'):
        r.update(estimatedMinutes=None,overloaded=None)
    else: r['overloaded']=None
    assert c.post('/api/v1/facts/check',json=f,headers=h).status_code==200

def test_actual_stream_ignores_forged_small_content_length():
    c,s,n,h=paired()
    def chunks():
        yield b' '*130000
        yield b' '*140000
    r=c.post('/api/v1/facts/check',content=chunks(),headers={**h,'content-type':'application/json','content-length':'1'})
    assert r.status_code==413

def test_rate_resets_and_session_does_not_slide():
    c,s,n,h=paired(); original_expiry=s.expires_at
    for _ in range(30): assert c.post('/api/v1/facts/check',json=FACTS,headers=h).status_code==200
    assert c.post('/api/v1/facts/check',json=FACTS,headers=h).status_code==429
    n[0]+=60
    assert c.post('/api/v1/facts/check',json=FACTS,headers=h).status_code==200
    assert s.expires_at==original_expiry

@pytest.mark.parametrize('body',[{}, {'connectionCode':True}, {'connectionCode':1},{'connectionCode':'a'*43,'extra':'private'}])
def test_pair_shape_is_strict(body):
    c,s,n=setup()
    r=c.post('/api/v1/session',json=body,headers=HEAD)
    assert r.status_code==422 and 'private' not in r.text

@pytest.mark.parametrize('escaped_code',[r'\ud800',r'\udfff'],ids=['high-surrogate','low-surrogate'])
def test_isolated_surrogate_code_is_invalid_credential(escaped_code,caplog):
    c,s,n=setup()
    body='{"connectionCode":"'+escaped_code+'"}'
    response=c.post('/api/v1/session',content=body,headers={**HEAD,'content-type':'application/json'})
    assert response.status_code==401
    assert response.json()['error']['code']=='CONNECTION_CODE_INVALID'
    assert escaped_code not in response.text+caplog.text
    assert s.session_token is None
    assert c.post('/api/v1/session',json={'connectionCode':s.connection_code},headers=HEAD).status_code==200

def test_allowed_origin_rate_limit_exposes_retry_after():
    c,s,n=setup()
    for _ in range(10):
        assert c.post('/api/v1/session',json={'connectionCode':'invalid'},headers=HEAD).status_code==401
    response=c.post('/api/v1/session',json={},headers=HEAD)
    assert response.status_code==429
    assert response.headers['access-control-allow-origin']==HEAD['origin']
    assert response.headers.get('access-control-expose-headers')=='Retry-After'
    assert int(response.headers['retry-after'])>0
    forbidden=c.post('/api/v1/session',json={},headers={**HEAD,'origin':'https://evil.example'})
    assert forbidden.status_code==403
    assert 'access-control-allow-origin' not in forbidden.headers
    assert 'access-control-expose-headers' not in forbidden.headers
