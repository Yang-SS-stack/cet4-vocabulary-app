"""The foreground runner distinguishes user interruption from service failure."""
import socket
from unittest.mock import Mock

import pytest

import linguajet_local.__main__ as runner
from linguajet_local.session import SessionState


@pytest.mark.parametrize(
    "failure,expected_exit",
    [(KeyboardInterrupt(), 0), (RuntimeError("private-runtime-detail"), 1)],
)
def test_runner_closes_socket_and_reports_exit(monkeypatch, capsys, failure, expected_exit):
    bound_socket = Mock(spec=socket.socket)
    server = Mock()
    server.run.side_effect = failure
    state = SessionState()
    state.connection_code = "synthetic-test-connection-code"
    monkeypatch.setattr(runner.socket, "socket", lambda *args: bound_socket)
    monkeypatch.setattr(runner.uvicorn, "Server", lambda config: server)
    monkeypatch.setattr(runner, "SessionState", lambda: state)

    try:
        exit_code = runner.main()
    except KeyboardInterrupt:
        pytest.fail("Ctrl+C escaped the foreground runner", pytrace=False)

    output = capsys.readouterr()
    assert exit_code == expected_exit
    bound_socket.close.assert_called_once()
    server.run.assert_called_once_with(sockets=[bound_socket])
    assert "Traceback" not in output.out + output.err
    assert "private-runtime-detail" not in output.out + output.err
    if expected_exit == 0:
        assert output.err == ""
        assert "\u672c\u673a\u670d\u52a1\u5df2\u505c\u6b62\u3002" in output.out
    else:
        assert "\u65e0\u6cd5\u7ee7\u7eed\u8fd0\u884c" in output.err
