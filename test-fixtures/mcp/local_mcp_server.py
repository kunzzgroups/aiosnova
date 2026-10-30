"""Local MCP simulation only: no database, model calls or tool execution."""

import argparse
import json
import threading
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PROTOCOL = "2025-11-25"


class SimulationServer(ThreadingHTTPServer):
    def __init__(self, port=19091):
        super().__init__(("127.0.0.1", port), Handler)
        self.sessions = {}
        self.session_lock = threading.Lock()


class Handler(BaseHTTPRequestHandler):
    def reply(self, status, body=None, session=None):
        data = b"" if body is None else json.dumps(
            body, ensure_ascii=False
        ).encode("utf-8")
        self.send_response(status)
        if body is not None:
            self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        if session is not None:
            self.send_header("MCP-Session-Id", session)
        self.end_headers()
        self.wfile.write(data)

    def do_POST(self):
        if self.path != "/mcp":
            self.reply(404)
            return

        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length < 1 or length > 1048576:
                self.reply(400)
                return
            request = json.loads(self.rfile.read(length).decode("utf-8"))
        except (ValueError, UnicodeError):
            self.reply(400)
            return

        if (not isinstance(request, dict)
                or request.get("jsonrpc") != "2.0"
                or not isinstance(request.get("method"), str)):
            self.reply(400)
            return

        method = request["method"]
        request_id = request.get("id")
        params = request.get("params", {})

        if not isinstance(params, dict):
            self.reply(400)
            return

        if method == "initialize":
            if not self.valid_request_id(request_id):
                self.reply(400)
                return
            session = str(uuid.uuid4())
            with self.server.session_lock:
                self.server.sessions[session] = False
            self.reply(200, {
                "jsonrpc": "2.0", "id": request_id,
                "result": {
                    "protocolVersion": PROTOCOL,
                    "capabilities": {"tools": {}},
                    "serverInfo": {
                        "name": "Local simulated MCP", "version": "1.0.0"
                    }
                }
            }, session)
            return

        session = self.headers.get("MCP-Session-Id")
        with self.server.session_lock:
            initialized = self.server.sessions.get(session)

        if initialized is None:
            self.reply(404)
            return

        if self.headers.get("MCP-Protocol-Version") != PROTOCOL:
            self.reply(400)
            return

        if method == "notifications/initialized":
            if "id" in request:
                self.reply(400)
                return
            with self.server.session_lock:
                self.server.sessions[session] = True
            self.reply(202)
            return

        if not self.valid_request_id(request_id):
            self.reply(400)
            return

        if not initialized:
            self.reply(400)
            return

        if method == "tools/list":
            cursor = params.get("cursor")
            if cursor not in (None, "page-two"):
                self.reply(200, {
                    "jsonrpc": "2.0", "id": request_id,
                    "error": {"code": -32602, "message": "Invalid cursor."}
                })
                return

            name = "calculator.add" if cursor is None else "calculator.subtract"
            result = {
                "tools": [{
                    "name": name,
                    "description": "Local simulated tool definition",
                    "inputSchema": {
                        "type": "object",
                        "properties": {
                            "a": {"type": "number"},
                            "b": {"type": "number"}
                        },
                        "required": ["a", "b"]
                    }
                }]
            }
            if cursor is None:
                result["nextCursor"] = "page-two"
            self.reply(200, {"jsonrpc": "2.0", "id": request_id, "result": result})
            return

        # No tools/call executor exists in this simulation.
        self.reply(200, {
            "jsonrpc": "2.0", "id": request_id,
            "error": {"code": -32601, "message": "Method not supported."}
        })

    @staticmethod
    def valid_request_id(value):
        return isinstance(value, (str, int)) and not isinstance(value, bool)

    def log_message(self, format, *args):
        print("SIMULATION:", format % args, flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=19091)
    args = parser.parse_args()
    with SimulationServer(args.port) as server:
        print(f"SIMULATION ONLY: http://127.0.0.1:{server.server_port}/mcp", flush=True)
        print("No database, model requests or tool execution.", flush=True)
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
