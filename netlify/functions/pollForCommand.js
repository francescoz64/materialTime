import { getStore } from "@netlify/blobs";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
	
	
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
        return new Response("Missing session_id", { status: 400 });
    }

    const commandStore = getStore("commands");
    const pollTimeout = 25000;
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
        const storedData = await commandStore.get(sessionId, { type: "json" });
        if (storedData) { // Trovato un comando
            console.log(`[pollForCommand] Found command for ${sessionId}.`);
            await commandStore.delete(sessionId);
            return new Response(JSON.stringify(storedData), {
                headers: { "Content-Type": "application/json" }
            });
        }
        await sleep(1000);
    }
    
    // Timeout
    return new Response(JSON.stringify({ command: 'NO_OP' }), {
        headers: { "Content-Type": "application/json" }
    });
	
};