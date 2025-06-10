// funzione che serve per mettere in ascolto la WebApp in attesa di risposte.
const { getStore } = require("@netlify/blobs");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.handler = async (event) => {
	
    const sessionId = event.queryStringParameters.session_id;


    if (!sessionId) {
        return { statusCode: 400, body: "Missing session_id" };
    }

    const responseStore = getStore("responses");
    const pollTimeout = 25000;
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
        const storedResponse = await responseStore.get(sessionId, { type: "json" });

        if (storedResponse) {
            console.log(`[pollForResponse] Found response for ${sessionId}.`);
            await responseStore.delete(sessionId);
            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(storedResponse)
            };
        }
        await sleep(1000);
    }

    // Timeout, nessuna nuova risposta
    return { statusCode: 204 }; // 204 No Content non richiede un body

};
