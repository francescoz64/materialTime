// A simple in-memory store. CAUTION: This will not work across different serverless instances.
// Good for low-traffic apps and testing. For production, use Netlify Blobs or a real DB.
const { getStore } = require("@netlify/blobs");

// La firma della funzione deve essere 'event', non 'req' o altro
exports.handler = async (event) => {
	
	
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        // Il corpo della richiesta è in event.body e deve essere parsato
        const { sessionId, command, payload, type } = JSON.parse(event.body);

        if (!sessionId) {
            // Le risposte devono essere oggetti { statusCode, body }
            return { statusCode: 400, body: "Missing sessionId" };
        }

        if (type === 'RESPONSE') {
            console.log(`[sendCommand] Received RESPONSE for session ${sessionId}:`, payload);
            const responseStore = getStore("responses");
            await responseStore.setJSON(sessionId, {
                type: payload.type,
                payload: payload.data,
                timestamp: Date.now()
            });
            return { statusCode: 200, body: JSON.stringify({ message: "Response stored." }) };
        } else {
            if (!command) {
                 return { statusCode: 400, body: "Missing command" };
            }
            console.log(`[sendCommand] Received COMMAND for session ${sessionId}:`, command);
            const commandStore = getStore("commands");
            await commandStore.setJSON(sessionId, {
                command,
                payload,
                timestamp: Date.now()
            });
            return { statusCode: 202, body: JSON.stringify({ message: "Command queued." }) };
        }
    } catch (error) {
        console.error("[sendCommand] Error:", error);
        return { statusCode: 500, body: "Internal Server Error" };
    }
	
};