"""Volatile single-start pairing and fixed-expiry session state."""
import secrets
import time
import hmac
import math
from collections import deque

class SessionState:
    def __init__(self, clock=time.time):
        self.clock=clock
        self.started_at=clock()
        self.connection_code=secrets.token_urlsafe(32)
        self.session_token=None
        self.expires_at=None
        self.pair_attempts=deque()
        self.fact_attempts=deque()
    def limit(self, kind):
        queue,maximum=(self.pair_attempts,10) if kind=='pair' else (self.fact_attempts,30)
        now=self.clock()
        while queue and queue[0]<=now-60: queue.popleft()
        if len(queue)>=maximum: return max(1,math.ceil(60-(now-queue[0])))
        queue.append(now)
        return None
    def pair(self, code):
        if self.session_token is not None or self.clock()>=self.started_at+300 or not hmac.compare_digest(code.encode('utf-8'),self.connection_code.encode('ascii')): return None
        self.session_token=secrets.token_urlsafe(32)
        self.expires_at=self.clock()+43200
        return self.session_token
    def authenticate(self, header):
        expected='Bearer '+self.session_token if self.session_token else None
        if expected is None or not hmac.compare_digest(header.encode('utf-8'),expected.encode('ascii')): return 'SESSION_REQUIRED'
        if self.clock()>=self.expires_at: return 'SESSION_EXPIRED'
        return None
