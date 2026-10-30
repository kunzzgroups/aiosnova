"""Protocol checks on an ephemeral loopback port. No backend/database access."""

import http.client
import json
import threading
import unittest

from local_mcp_server import PROTOCOL, SimulationServer


class LocalMcpServerTest(unittest.TestCase):
    def setUp(self):
        self.server = SimulationServer(0)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=2)

    def post(self, message, session=None, protocol=PROTOCOL):
        headers = {"Content-Type": "application/json",
                   "Accept": "application/json, text/event-stream"}
        if session is not None:
            headers["MCP-Session-Id"] = session
        if protocol is not None:
            headers["MCP-Protocol-Version"] = protocol
        connection = http.client.HTTPConnection("127.0.0.1", self.server.server_port, timeout=2)
        try:
            connection.request("POST", "/mcp", json.dumps(message), headers)
            response = connection.getresponse()
            data = response.read()
            return response.status, response.getheader("MCP-Session-Id"), (
                json.loads(data) if data else None)
        finally:
            connection.close()

    def initialize(self, ready=True):
        status, session, body = self.post({
            "jsonrpc": "2.0", "id": "init-1", "method": "initialize",
            "params": {"protocolVersion": PROTOCOL, "capabilities": {},
                       "clientInfo": {"name": "test", "version": "1.0"}}
        })
        self.assertEqual(200, status)
        self.assertIsNotNone(session)
        self.assertEqual("init-1", body["id"])
        self.assertEqual(PROTOCOL, body["result"]["protocolVersion"])
        if ready:
            status, _, body = self.post({"jsonrpc": "2.0", "method": "notifications/initialized"}, session)
            self.assertEqual(202, status)
            self.assertIsNone(body)
        return session

    def test_complete_handshake_and_two_pages(self):
        session = self.initialize()
        names = []
        for request_id, params in [("list-1", {}), ("list-2", {"cursor": "page-two"})]:
            status, _, body = self.post({"jsonrpc": "2.0", "id": request_id,
                                        "method": "tools/list", "params": params}, session)
            self.assertEqual(200, status)
            self.assertEqual(request_id, body["id"])
            names.extend(tool["name"] for tool in body["result"]["tools"])
            if request_id == "list-1":
                self.assertEqual("page-two", body["result"]["nextCursor"])
            else:
                self.assertNotIn("nextCursor", body["result"])
        self.assertEqual(["calculator.add", "calculator.subtract"], names)

    def test_missing_or_unknown_session_is_rejected(self):
        for session in (None, "unknown-session"):
            self.assertEqual(404, self.post({"jsonrpc": "2.0", "id": 1,
                                            "method": "tools/list"}, session)[0])

    def test_missing_or_wrong_protocol_is_rejected(self):
        session = self.initialize()
        for protocol in (None, "unsupported"):
            self.assertEqual(400, self.post({"jsonrpc": "2.0", "id": 1,
                                            "method": "tools/list"}, session, protocol)[0])

    def test_list_before_initialized_is_rejected(self):
        session = self.initialize(ready=False)
        self.assertEqual(400, self.post({"jsonrpc": "2.0", "id": 1,
                                        "method": "tools/list"}, session)[0])

    def test_invalid_messages_do_not_create_sessions(self):
        for message in (None, [], {}, {"jsonrpc": "2.0", "method": "initialize", "id": True},
                        {"jsonrpc": "2.0", "method": "initialize", "id": 1, "params": []}):
            self.assertEqual(400, self.post(message)[0])
        self.assertEqual({}, self.server.sessions)

    def test_invalid_cursor_returns_rpc_error(self):
        session = self.initialize()
        status, _, body = self.post({"jsonrpc": "2.0", "id": 2, "method": "tools/list",
                                     "params": {"cursor": "invalid"}}, session)
        self.assertEqual(200, status)
        self.assertEqual(-32602, body["error"]["code"])
        self.assertNotIn("result", body)

    def test_tool_execution_is_not_implemented(self):
        session = self.initialize()
        status, _, body = self.post({"jsonrpc": "2.0", "id": 3, "method": "tools/call",
                                     "params": {"name": "calculator.add", "arguments": {"a": 2, "b": 3}}}, session)
        self.assertEqual(200, status)
        self.assertEqual(-32601, body["error"]["code"])
        self.assertNotIn("result", body)


if __name__ == "__main__":
    unittest.main()
