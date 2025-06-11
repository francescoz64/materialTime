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

        // --- GESTIONE DELLE RISPOSTE DALL'ESP32 ---
        // Questa parte del codice rimane invariata.
        if (type === 'RESPONSE') {
            if (!payload || !payload.type) {
                return new Response("Invalid response payload", { status: 400 });
            }
            
            console.log(`[sendCommand] Storing RESPONSE for ${sessionId} of type ${payload.type}`);
            const responseStore = getStore("responses");
            
            // La struttura che salvi è { type: "TIPO", payload: {DATI}, timestamp: ... }
            await responseStore.setJSON(sessionId, {
                type: payload.type,
                payload: payload.data, // Corretto, prendiamo il `data` dal payload dell'ESP32
                timestamp: Date.now()
            });

            return new Response(JSON.stringify({ message: "Response stored." }), { status: 200 });
        
        // --- GESTIONE DEI COMANDI DALLA WEBAPP ---
        } else {
            if (!command) {
                return new Response("Missing command", { status: 400 });
            }

            // Se il comando inviato dalla WebApp è una richiesta di stato (GET_STATE),
            // cogliamo l'occasione per eliminare qualsiasi risposta vecchia e non letta
            // per questa sessione. Questo evita che la WebApp riceva risposte "fantasma"
            // (es. un vecchio NACK) relative a comandi precedenti.
            if (command === 'GET_STATE') {
                console.log(`[sendCommand] Clearing old responses for ${sessionId} before queueing GET_STATE.`);
                const responseStore = getStore("responses");
                await responseStore.delete(sessionId);
            }
 
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