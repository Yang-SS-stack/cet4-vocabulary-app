"""Fixed-origin, summary-only API. No access or payload logging."""
import json
import math
from datetime import datetime, timezone
from fastapi import FastAPI
from starlette.requests import Request
from starlette.responses import JSONResponse, Response
from pydantic import ValidationError
from .contracts import Facts, Pairing
from .session import SessionState

ORIGIN='https://yang-ss-stack.github.io'
HOST='127.0.0.1:5280'
PATHS={'/api/v1/health':'GET','/api/v1/session':'POST','/api/v1/facts/check':'POST'}
MESSAGES={'SOURCE_FORBIDDEN':'请求来源不允许。','SESSION_REQUIRED':'请先连接本机后端。','SESSION_EXPIRED':'连接已过期，请重新启动服务配对。','CONNECTION_CODE_INVALID':'连接码无效，请重新启动服务配对。','RATE_LIMITED':'请求过于频繁，请稍后再试。','BODY_TOO_LARGE':'请求正文超过限制。','CONTENT_TYPE_UNSUPPORTED':'请使用 JSON 请求。','INVALID_JSON':'JSON 格式不合法。','FACTS_INVALID':'请求字段或关系不符合要求。','API_NOT_FOUND':'接口不存在。','INTERNAL_ERROR':'服务暂时无法处理请求。'}
def utc(timestamp):
    return datetime.fromtimestamp(timestamp,timezone.utc).isoformat(timespec='milliseconds').replace('+00:00','Z')
def reject(status,code,headers=None):
    return JSONResponse({'error':{'code':code,'message':MESSAGES[code]}},status_code=status,headers=headers)
def finite_float(value):
    result=float(value)
    if not math.isfinite(result): raise ValueError('finite')
    return result

def pairs(items):
    result={}
    for key,value in items:
        if key in result: raise ValueError('duplicate')
        result[key]=value
    return result

def create_app(*,state=None,clock=None):
    state=state or SessionState(**({'clock':clock} if clock else {}))
    app=FastAPI(docs_url=None,redoc_url=None,openapi_url=None)
    app.state.session=state
    @app.middleware('http')
    async def boundary(request,call_next):
        allowed=request.headers.get('origin')==ORIGIN and len(request.headers.getlist('origin'))==1
        headers={'Cache-Control':'no-store'}
        if allowed: headers.update({'Access-Control-Allow-Origin':ORIGIN,'Vary':'Origin'})
        try:
            response=await dispatch(request)
        except Exception:
            response=reject(500,'INTERNAL_ERROR')
        response.headers.update(headers)
        return response
    async def dispatch(request: Request):
        # Source boundary precedes route, authentication, rate and body checks.
        for name,value in [('host',HOST),('origin',ORIGIN)]:
            if request.headers.get(name)!=value or len(request.headers.getlist(name))!=1: return reject(403,'SOURCE_FORBIDDEN')
        path=request.url.path
        if path not in PATHS: return reject(404,'API_NOT_FOUND')
        if request.method=='OPTIONS':
            requested=request.headers.get('access-control-request-method')
            requested_headers={v.strip().lower() for v in request.headers.get('access-control-request-headers','').split(',') if v.strip()}
            if requested!=PATHS[path] or not requested_headers <= {'content-type','authorization'}: return reject(403,'SOURCE_FORBIDDEN')
            return Response(status_code=204,headers={'Access-Control-Allow-Methods':PATHS[path],'Access-Control-Allow-Headers':'Content-Type, Authorization'})
        if request.headers.get('sec-fetch-site')!='cross-site' or len(request.headers.getlist('sec-fetch-site'))!=1: return reject(403,'SOURCE_FORBIDDEN')
        if request.method!=PATHS[path]: return reject(404,'API_NOT_FOUND')
        if request.url.query: return reject(403,'SOURCE_FORBIDDEN')
        if path.endswith('/health'): return JSONResponse({'service':'linguajet-local','contractVersion':1})
        if path.endswith('/facts/check'):
            auth=request.headers.get('authorization','')
            if len(request.headers.getlist('authorization'))!=1: return reject(401,'SESSION_REQUIRED')
            failure=state.authenticate(auth)
            if failure: return reject(401,failure)
        retry=state.limit('pair' if path.endswith('/session') else 'facts')
        if retry: return reject(429,'RATE_LIMITED',{'Retry-After':str(retry)})
        if request.headers.get('content-type','').split(';')[0].strip().lower()!='application/json': return reject(415,'CONTENT_TYPE_UNSUPPORTED')
        limit=4096 if path.endswith('/session') else 262144
        chunks=bytearray()
        async for chunk in request.stream():
            if len(chunks)+len(chunk)>limit: return reject(413,'BODY_TOO_LARGE')
            chunks.extend(chunk)
        received=utc(state.clock())
        try:
            data=json.loads(chunks.decode('utf-8'),object_pairs_hook=pairs,parse_float=finite_float,parse_constant=lambda _: (_ for _ in ()).throw(ValueError('finite')))
        except (ValueError,UnicodeError,RecursionError): return reject(400,'INVALID_JSON')
        try:
            model=(Pairing if path.endswith('/session') else Facts).model_validate(data)
        except (ValidationError,ValueError,OverflowError): return reject(422,'FACTS_INVALID')
        if isinstance(model,Pairing):
            token=state.pair(model.connectionCode)
            if token is None: return reject(401,'CONNECTION_CODE_INVALID')
            return JSONResponse({'sessionToken':token,'expiresAt':utc(state.expires_at)})
        return JSONResponse({'contractVersion':1,'requestId':model.requestId,'snapshotToken':model.basis.snapshotToken,'factsToken':model.basis.factsToken,'status':'validated','receivedAt':received})
    return app
