// A simple in-memory store. CAUTION: This will not work across different serverless instances.
import { getStore } from "@netlify/blobs";

export default async (req) => {
	
	
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }
    try {
        const body = await req.json();
        const { sessionId, command, payload = {}, type } = body;

        if (!sessionId) {
            return new Response("Missing sessionId", { status: 400 });
        }

        if (type === 'RESPONSE') {
            if (!payload || !payload.type) return new Response("Invalid response payload", { status: 400 });
            
            console.log(`[sendCommand] Storing RESPONSE for ${sessionId}`);
            const responseStore = getStore("responses");
            await responseStore.setJSON(sessionId, {
                type: payload.type,
                payload: payload.data,
                timestamp: Date.now()
            });
            return new Response(JSON.stringify({ message: "Response stored." }), { status: 200 });
        } else {
            if (!command) return new Response("Missing command", { status: 400 });

            console.log(`[sendCommand] Storing COMMAND for ${sessionId}: ${command}`);
            const commandStore = getStore("commands");
            await commandStore.setJSON(sessionId, {
                command,
                payload,
                timestamp: Date.now()
            });
            return new Response(JSON.stringify({ message: "Command queued." }), { status: 202 });
        }
    } catch (error) {
        console.error("[sendCommand] Runtime Error:", error);
        return new Response(`Internal Server Error: ${error.message}`, { status: 500 });
    }
	
};