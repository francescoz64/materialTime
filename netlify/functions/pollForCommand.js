const { getStore } = require("@netlify/blobs");
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

exports.handler = async (event) => {
	
	
    // I parametri sono in event.queryStringParameters
    const sessionId = event.queryStringParameters.session_id;

    if (!sessionId) {
        return { statusCode: 400, body: "Missing session_id query parameter" };
    }

    console.log(`[pollForCommand] Device with session ${sessionId} is polling...`);

    const commandStore = getStore("commands");
    const pollTimeout = 25000;
    const pollInterval = 1000;
    const startTime = Date.now();

    while (Date.now() - startTime < pollTimeout) {
        const storedData = await commandStore.get(sessionId, { type: "json" });

        if (storedData && storedData.command) {
            console.log(`[pollForCommand] Found command for ${sessionId}.`);
            await commandStore.delete(sessionId);

            return {
                statusCode: 200,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(storedData)
            };
        }
        await sleep(pollInterval);
    }

    console.log(`[pollForCommand] Poll timeout for ${sessionId}.`);
    
    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ command: 'NO_OP' })
    };
	
};