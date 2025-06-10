// A simple in-memory store. CAUTION: This will not work across different serverless instances.
// Good for low-traffic apps and testing. For production, use Netlify Blobs or a real DB.
import { getStore } from "@netlify/blobs";

export default async (req) => {
	
	
    // Solo per richieste POST
    if (req.method !== "POST") {
        return new Response("Method Not Allowed", { status: 405 });
    }

    try {
        const { sessionId, command, payload } = await req.json();

        if (!sessionId || !command) {
            return new Response("Missing sessionId or command", { status: 400 });
        }

        console.log(`[sendCommand] Received command for session ${sessionId}:`, command);

        // Prende lo store 'commands' (lo crea se non esiste)
        const commandStore = getStore("commands");
        
        // Salva il comando nello store, usando sessionId come chiave
        await commandStore.setJSON(sessionId, { 
            command, 
            payload, 
            timestamp: Date.now()
        });

        return new Response(JSON.stringify({ message: "Command queued for device." }), {
            status: 202, // Accepted
            headers: { "Content-Type": "application/json" },
        });

    } catch (error) {
        console.error("[sendCommand] Error:", error);
        return new Response("Internal Server Error", { status: 500 });
    }
	
};



// Config per Netlify per specificare il percorso (opzionale se il nome file corrisponde)
export const config = {
	
  path: "/.netlify/functions/sendCommand"
  
};