"""Foreground, single-process runner. Bind succeeds before code is exposed."""
import socket
import sys
import uvicorn
from .app import create_app
from .session import SessionState

def main():
    sock=socket.socket(socket.AF_INET,socket.SOCK_STREAM)
    try:
        if hasattr(socket,'SO_EXCLUSIVEADDRUSE'):
            sock.setsockopt(socket.SOL_SOCKET,socket.SO_EXCLUSIVEADDRUSE,1)
        sock.bind(('127.0.0.1',5280))
        sock.listen(128)
    except OSError:
        sock.close()
        print('本机地址 127.0.0.1:5280 无法绑定；请检查端口占用。',file=sys.stderr)
        return 1
    state=SessionState()
    print('本机服务：http://127.0.0.1:5280\n连接码有效期：5 分钟；会话有效期：12 小时\n一次性连接码：'+state.connection_code+'\n保持本窗口开启；Ctrl+C 停止。',flush=True)
    config=uvicorn.Config(create_app(state=state),host='127.0.0.1',port=5280,workers=1,reload=False,access_log=False,log_config=None,log_level='critical')
    try:
        uvicorn.Server(config).run(sockets=[sock])
    except KeyboardInterrupt:
        print('本机服务已停止。',flush=True)
        return 0
    except Exception:
        print('本机服务无法继续运行，请重新启动。',file=sys.stderr)
        return 1
    finally:
        sock.close()
    return 0
if __name__=='__main__':
    sys.exit(main())
