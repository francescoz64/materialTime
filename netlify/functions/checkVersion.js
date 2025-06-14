/**
 * Endpoint API per il controllo della versione del firmware OTA.
 * 
 * Questa funzione viene chiamata dall'ESP32 per verificare se è disponibile
 * un nuovo aggiornamento. Restituisce un oggetto JSON con i dettagli
 * dell'ultimo firmware stabile.
 * 
 * METODO: GET
 * ENDPOINT: /.netlify/functions/checkVersion
 */

exports.handler = async (event, context) => {

	// ====================================================================
	//
	// MODIFICARE QUESTI VALORI PER OGNI NUOVA FIRMWARE RELEASE
	//
	const latestFirmware = {
	version: "1.0.1",
	firmware_url: "https://materialtime.netlify.app/firmware/esp32/firmware.bin",
	size: 853472 // <-- IMPORTANTE: La dimensione ESATTA del file firmware.bin in byte
	};
	// Il campo size è cruciale. Il codice OTA sull'ESP32 usa questo valore per dire al sistema operativo "sto per scrivere un file di X byte". 
	// Se lo spazio non è sufficiente, l'aggiornamento si blocca subito in modo sicuro, invece di fallire a metà.
	// Come ottenere la dimensione esatta del file firmware.bin?
	// clic con il tasto destro sul file -> Proprietà -> la "Dimensione" (non "Dimensioni su disco") in byte.

	//
	// ====================================================================


	// Controlla che il metodo della richiesta sia GET
	if (event.httpMethod !== 'GET') {
		return {
			statusCode: 405, // Method Not Allowed
			body: JSON.stringify({ error: 'Metodo non consentito. Usare GET.' }),
		};
	}

	// Se tutto è corretto, restituisce i dettagli del firmware
	return {
		statusCode: 200,
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*' // Permette l'accesso da qualsiasi origine
	},
	body: JSON.stringify(latestFirmware),
	};
};