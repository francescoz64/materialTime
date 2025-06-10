// A simple in-memory store. CAUTION: This will not work across different serverless instances.
// Good for low-traffic apps and testing. For production, use Netlify Blobs or a real DB.
import { getStore } from "@netlify/blobs";

export default async (req) => {
	
	
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const { sessionId, command, payload, type } = await req.json();

        if (!sessionId) {
            return new Response("Missing sessionId", { status: 400 });
        }

        // Determina se è un comando dalla WebApp o una risposta dall'ESP32
        if (type === 'RESPONSE') {
            // È una risposta dall'ESP32
            console.log(`[sendCommand] Received RESPONSE for session ${sessionId}:`, payload);
            const responseStore = getStore("responses");
            await responseStore.setJSON(sessionId, {
                type: payload.type, // es. 'STATE_UPDATE' o 'ACK'
                payload: payload.data,
                timestamp: Date.now()
            });
            return new Response(JSON.stringify({ message: "Response stored." }), { status: 200 });

        } else {
            // È un comando dalla WebApp
            if (!command) {
                 return new Response("Missing command", { status: 400 });
            }
            console.log(`[sendCommand] Received COMMAND for session ${sessionId}:`, command);
            const commandStore = getStore("commands");
            await commandStore.setJSON(sessionId, {
                command,
                payload,
                timestamp: Date.now()
            });
            return new Response(JSON.stringify({ message: "Command queued." }), { status: 202 });
        }

    } catch (error) {
        console.error("[sendCommand] Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
	
};




// Config per Netlify per specificare il percorso (opzionale se il nome file corrisponde)
export const config = { path: "/.netlify/functions/sendCommand" };

