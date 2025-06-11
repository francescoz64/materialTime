import { getStore } from "@netlify/blobs";

// Funzione helper per l'attesa
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

import { getStore } from "@netlify/blobs";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
        return new Response(JSON.stringify({ error: "Missing session_id" }), {
            status: 400, headers: { "Content-Type": "application/json" }
        });
    }
    
    const commandStore = getStore("commands");
    const responseStore = getStore("responses");

    try {
        console.log(`[getInitialState] Storing command GET_STATE for session ${sessionId}`);
        await commandStore.setJSON(sessionId, {
            command: 'GET_STATE',
            payload: {},
            timestamp: Date.now()
        });

        const startTime = Date.now();
        // --- MODIFICA CHIAVE QUI ---
        // Riduciamo il timeout a 9 secondi per rimanere sotto il limite di 10s di Netlify.
        const timeout = 9000; 

        console.log(`[getInitialState] Waiting for STATE_UPDATE response for session ${sessionId}...`);
        while (Date.now() - startTime < timeout) {
            const responseData = await responseStore.get(sessionId, { type: "json" });

            if (responseData && responseData.type === 'STATE_UPDATE') {
                console.log(`[getInitialState] Found STATE_UPDATE response for ${sessionId}`);
                await responseStore.delete(sessionId); 
                
                // NOTA: La tua sendCommand salva un oggetto { type, payload, timestamp }.
                // La mia versione precedente restituiva responseData.payload, che ora è sbagliato.
                // Restituiamo l'intero oggetto così la webapp può gestirlo.
                // Anzi, la webapp si aspetta solo lo stato, quindi `responseData.payload` è giusto,
                // ma il tuo sendCommand salva `payload.data` dentro `responseData.payload`.
                // Per coerenza, modifichiamo cosa viene restituito.
                // La tua `sendResponseToServer` invia: { type: "STATE_UPDATE", data: { ...stato... } }
                // La tua `sendCommand` salva: { type: "STATE_UPDATE", payload: { ...stato... }, timestamp: ... }
                // La tua `handleClockData` si aspetta lo stato direttamente.
                // Quindi `responseData.payload` è l'oggetto di stato corretto da restituire.
                return new Response(JSON.stringify(responseData.payload), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            await sleep(500);
        }

        console.warn(`[getInitialState] Timeout waiting for device response for session ${sessionId}`);
        return new Response(JSON.stringify({ error: "Timeout: l'orologio non ha risposto in tempo (9s)." }), {
            status: 408,
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error(`[getInitialState] Internal server error for session ${sessionId}:`, error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
};