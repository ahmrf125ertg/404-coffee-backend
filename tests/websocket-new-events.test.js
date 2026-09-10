const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const Module = require("module");

try { require("dotenv/config"); } catch (_) {}

describe("WebSocket — New Events (Phase 5+9)", () => {
    let mockCalls;
    let mockIO;
    let cleanup;

    function installMock() {
        mockCalls = [];
        mockIO = {
            to: (...rooms) => {
                const target = {
                    emit: (event, data) => { mockCalls.push({ rooms: [...rooms], event, data }); },
                    to: (...moreRooms) => ({
                        emit: (event, data) => { mockCalls.push({ rooms: [...rooms, ...moreRooms], event, data }); },
                    }),
                };
                return target;
            },
        };

        // Inject mock into socket.server module cache
        const socketServerPath = require.resolve("../src/websocket/socket.server");
        require.cache[socketServerPath] = {
            id: socketServerPath,
            filename: socketServerPath,
            loaded: true,
            exports: {
                initSocket: () => mockIO,
                getIO: () => mockIO,
                BRANCH_ROOM: "admin:branch:1",
                WAITERS_ROOM: "waiters:branch:1",
                PREPARATION_ROOM: "preparation:branch:1",
            },
        };

        // Clear socket.events cache so it picks up mocked socket.server
        const eventsPath = require.resolve("../src/websocket/socket.events");
        delete require.cache[eventsPath];

        cleanup = () => {
            delete require.cache[socketServerPath];
            delete require.cache[eventsPath];
        };
    }

    beforeEach(() => {
        installMock();
    });

    it("emitServiceRequestCreated emits table-service:created to orders + waiters", () => {
        const { emitServiceRequestCreated } = require("../src/websocket/socket.events");
        const request = { id: "sr-1", tableNumber: 5, type: "CLEANING", status: "PENDING" };

        emitServiceRequestCreated(request);

        const createdCall = mockCalls.find(c => c.event === "table-service:created");
        assert.ok(createdCall, "Should emit table-service:created event");
        assert.deepEqual(createdCall.data.request, request);
        assert.ok(createdCall.rooms.includes("orders"), "Should emit to orders room");
        assert.ok(createdCall.rooms.includes("waiters:branch:1"), "Should emit to waiters room");
        cleanup();
    });

    it("emitServiceRequestUpdated emits table-service:updated to orders + waiters", () => {
        const { emitServiceRequestUpdated } = require("../src/websocket/socket.events");
        const request = { id: "sr-1", tableNumber: 5, type: "WATER", status: "ACKNOWLEDGED" };

        emitServiceRequestUpdated(request);

        const updatedCall = mockCalls.find(c => c.event === "table-service:updated");
        assert.ok(updatedCall, "Should emit table-service:updated event");
        assert.deepEqual(updatedCall.data.request, request);
        assert.ok(updatedCall.rooms.includes("orders"), "Should emit to orders room");
        assert.ok(updatedCall.rooms.includes("waiters:branch:1"), "Should emit to waiters room");
        cleanup();
    });

    it("emitTableSessionUpdated emits table-session:updated to orders + table-session room", () => {
        const { emitTableSessionUpdated } = require("../src/websocket/socket.events");
        const session = { id: "ts-1", tableNumber: 3, status: "OPEN", guestsCount: 2 };

        emitTableSessionUpdated(session);

        const ordersCall = mockCalls.find(c => c.event === "table-session:updated" && c.rooms.includes("orders"));
        assert.ok(ordersCall, "Should emit table-session:updated to orders room");

        const sessionCall = mockCalls.find(c => c.event === "table-session:updated" && c.rooms.some(r => r.startsWith("table-session:")));
        assert.ok(sessionCall, "Should emit table-session:updated to table-session room");
        assert.deepEqual(sessionCall.data.session, session);
        cleanup();
    });

    it("emitTableSessionUpdated works without session.id (no specific room)", () => {
        const { emitTableSessionUpdated } = require("../src/websocket/socket.events");
        const session = { tableNumber: 3, status: "CLOSED" };

        emitTableSessionUpdated(session);

        const sessionCall = mockCalls.find(c => c.event === "table-session:updated");
        assert.ok(sessionCall, "Should emit table-session:updated event");
        assert.ok(sessionCall.rooms.includes("orders"), "Should emit to orders room");
        assert.ok(!sessionCall.rooms.includes("table-session:undefined"), "Should NOT emit to undefined room");
        cleanup();
    });

    it("emitServiceRequestCreated ignores errors silently (no throw)", () => {
        const { emitServiceRequestCreated } = require("../src/websocket/socket.events");
        // Should not throw even with invalid input
        assert.doesNotThrow(() => emitServiceRequestCreated(null));
        assert.doesNotThrow(() => emitServiceRequestCreated(undefined));
        cleanup();
    });
});
