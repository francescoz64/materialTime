// netlify/functions/pollForResponse.js
// VERSIONE 2.0 - CON DELETE E LOG DI DEBUG

import { getStore } from "@netlify/blobs";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
        return new Response("Missing session_id", { status: 400 });
    }
    
    const responseStore = getStore("responses");
    const pollTimeout = 9000;
    const startTime = Date.now();

    try {
        while (Date.now() - startTime < pollTimeout) {
            const storedResponse = await responseStore.get(sessionId, { type: "json" });
            
            if (storedResponse) {
                // Log di debug per essere sicuri che la nuova versione sia in esecuzione
                console.log(`[pollForResponse V2] Found response for ${sessionId}. Type: ${storedResponse.type}. Deleting and returning.`);
                
                await responseStore.delete(sessionId);
                
                return new Response(JSON.stringify(storedResponse), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            await sleep(1000);
        }

        return new Response(null, { status: 204 });

    } catch (error) {
        console.error(`[pollForResponse V2] General error for session ${sessionId}:`, error);
        return new Response("Internal Server Error", { status: 500 });
    }
};