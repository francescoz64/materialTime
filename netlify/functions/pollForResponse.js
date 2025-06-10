import { getStore } from "@netlify/blobs";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
	
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");


    if (!sessionId) {
        return new Response("Missing session_id", { status: 400 });
    }
    
    const responseStore = getStore("responses");
    const pollTimeout = 25000;
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
        const storedResponse = await responseStore.get(sessionId, { type: "json" });
        if (storedResponse) {
            console.log(`[pollForResponse] Found response for ${sessionId}.`);
            await responseStore.delete(sessionId);
            return new Response(JSON.stringify(storedResponse), {
                headers: { "Content-Type": "application/json" }
            });
        }
        await sleep(1000);
    }

    // Timeout, nessuna nuova risposta
    return new Response(null, { status: 204 });

};