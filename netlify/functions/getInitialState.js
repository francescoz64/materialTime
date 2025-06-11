import { getStore } from "@netlify/blobs";

// Funzione helper per l'attesa
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
    // 1. Estrai il session_id dall'URL
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
        return new Response(JSON.stringify({ error: "Missing session_id" }), {
            status: 400,
            headers: { "Content-Type": "application/json" }
        });
    }
    
    // 2. Accedi agli store usando gli stessi nomi del tuo codice: "commands" e "responses"
    const commandStore = getStore("commands");
    const responseStore = getStore("responses");

    try {
        // 3. Invia il comando GET_STATE, usando la stessa struttura di `sendCommand`
        console.log(`[getInitialState] Storing command GET_STATE for session ${sessionId}`);
        await commandStore.setJSON(sessionId, {
            command: 'GET_STATE',
            payload: {}, // Payload vuoto, come fa la tua WebApp
            timestamp: Date.now()
        });

        // 4. Mettiti in attesa attiva della risposta (fino a 12 secondi)
        const startTime = Date.now();
        const timeout = 12000; 

        console.log(`[getInitialState] Waiting for STATE_UPDATE response for session ${sessionId}...`);
        while (Date.now() - startTime < timeout) {
            // Leggi dallo store delle risposte
            const responseData = await responseStore.get(sessionId, { type: "json" });

            // La tua `sendResponseToServer` sull'ESP32 invia un payload con un tipo e dei dati.
            // La tua `sendCommand` salva questi dati.
            // Quindi cerchiamo una risposta il cui payload.type sia 'STATE_UPDATE'.
            if (responseData && responseData.type === 'STATE_UPDATE') {
                console.log(`[getInitialState] Found STATE_UPDATE response for ${sessionId}`);
                
                // Pulisci la risposta per non rileggerla
                await responseStore.delete(sessionId); 
                
                // Restituisci il payload.data, che contiene lo stato vero e proprio dell'orologio
                return new Response(JSON.stringify(responseData.payload), {
                    status: 200,
                    headers: { "Content-Type": "application/json" }
                });
            }
            // Attendi un po' prima di controllare di nuovo
            await sleep(500);
        }

        // 5. Se il ciclo finisce, è scattato il timeout
        console.warn(`[getInitialState] Timeout waiting for device response for session ${sessionId}`);
        return new Response(JSON.stringify({ error: "Timeout: l'orologio non ha risposto in tempo." }), {
            status: 408, // 408 Request Timeout
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
