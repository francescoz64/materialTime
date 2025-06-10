import { getStore } from "@netlify/blobs";

// Helper per il ritardo
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
	
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");


    if (!sessionId) {
        return new Response("Missing session_id query parameter", { status: 400 });
    }

    console.log(`[pollForCommand] Device with session ${sessionId} is polling...`);

    const commandStore = getStore("commands");
    
    // Loop di Long Polling
    const pollTimeout = 25000; // 25 secondi
    const pollInterval = 1000;   // 1 secondo
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
        // Controlla se esiste un comando per questa sessione
        const storedData = await commandStore.get(sessionId, { type: "json" });

        if (storedData && storedData.command) {
            console.log(`[pollForCommand] Found command for ${sessionId}. Sending to device.`);
            
            // Rimuovi il comando dallo store per non inviarlo di nuovo
            await commandStore.delete(sessionId);

            return new Response(JSON.stringify(storedData), {
                status: 200,
                headers: { "Content-Type": "application/json" },
            });
        }

        await sleep(pollInterval);
    }

    console.log(`[pollForCommand] Poll timeout for session ${sessionId}. No command.`);
    
    // Timeout, rispondi con un comando vuoto (No-Operation)
    return new Response(JSON.stringify({ command: 'NO_OP' }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
    });
	
};




// Config per Netlify
export const config = {
	
  path: "/.netlify/functions/pollForCommand"
  
};