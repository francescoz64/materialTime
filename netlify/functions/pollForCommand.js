// VERSIONE DI DEBUG 2.0 - ASSICURA LA CANCELLAZIONE DEL COMANDO

import { getStore } from "@netlify/blobs";
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export default async (req) => {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("session_id");

    if (!sessionId) {
        return new Response("Missing session_id", { status: 400 });
    }

    const commandStore = getStore("commands");
    const pollTimeout = 9000;
    const startTime = Date.now();

    try {
        while (Date.now() - startTime < pollTimeout) {
            const storedData = await commandStore.get(sessionId, { type: "json" });
            
            if (storedData) {
                // Log dettagliati per il debug
                console.log(`[pollForCommand V2] Found command for ${sessionId}: ${storedData.command}`);
                console.log(`[pollForCommand V2] Attempting to delete command for ${sessionId}...`);
                
                try {
                    await commandStore.delete(sessionId);
                    console.log(`[pollForCommand V2] Successfully deleted command for ${sessionId}.`);
                } catch (deleteError) {
                    console.error(`[pollForCommand V2] CRITICAL: Failed to delete command for session ${sessionId}. Error:`, deleteError);
                    continue; 
                }
                
                return new Response(JSON.stringify(storedData), {
                    headers: { "Content-Type": "application/json" }
                });
            }
            await sleep(1000);
        }
        
        return new Response(JSON.stringify({ command: 'NO_OP' }), {
            headers: { "Content-Type": "application/json" }
        });

    } catch (error) {
        console.error(`[pollForCommand V2] General error for session ${sessionId}:`, error);
        return new Response("Internal Server Error", { status: 500 });
    }
};