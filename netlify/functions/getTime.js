import { utcToZonedTime, format } from 'date-fns-tz';
// Aggiungiamo un import di test dalla libreria principale
import { getUnixTime } from 'date-fns'; 

// La funzione handler che Netlify eseguirà
export async function handler(event, context) {
  // === INIZIO BLOCCO DI DEBUG ===
  console.log("--- Funzione getTime avviata ---");
  // ============================

  // Ottieni il parametro 'tz' dalla query string. Netlify lo rende disponibile in event.queryStringParameters
  // Se non è fornito o è una stringa vuota, usa 'UTC' come default.
  let timezoneIdentifier = event.queryStringParameters.tz || 'UTC';
  if (typeof timezoneIdentifier !== 'string' || timezoneIdentifier.trim() === '') {
    timezoneIdentifier = 'UTC';
  }
  
  // === BLOCCO DI DEBUG ===
  console.log(`Passo 1: Timezone richiesto: '${timezoneIdentifier}'`);
  // =======================

  try {
    // 1. Ottieni l'ora corrente (oggetti Date in JS sono sempre in UTC)
    const nowUtc = new Date();
    
    // === BLOCCO DI DEBUG ===
    console.log(`Passo 2: Oggetto Date UTC creato con successo: ${nowUtc.toISOString()}`);
    // Testiamo la dipendenza 'date-fns' base
    const unixTest = getUnixTime(nowUtc);
    console.log(`Passo 3: Test 'date-fns' (getUnixTime) OK. Valore: ${unixTest}`);
    // =======================

    // 2. Converti l'ora UTC nella timezone specificata
    const nowInTimezone = utcToZonedTime(nowUtc, timezoneIdentifier);
    
    // === BLOCCO DI DEBUG ===
    console.log(`Passo 4: 'utcToZonedTime' eseguito con successo.`);
    // =======================

    // 3. Formatta la data e l'ora come richiesto
    const formattedDateTime = format(nowInTimezone, 'yyyy-MM-dd HH:mm:ss', {
      timeZone: timezoneIdentifier,
    });
    
    // === BLOCCO DI DEBUG ===
    console.log(`Passo 5: Formattazione finale completata: '${formattedDateTime}'`);
    // =======================

    // 4. Prepara la risposta JSON di successo
    const response = {
      success: true,
      datetime: formattedDateTime,
      timezone_used: timezoneIdentifier,
    };

    // 5. Ritorna la risposta
    return {
      statusCode: 200, // OK
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    // === BLOCCO DI DEBUG ===
    console.error("!!! ERRORE CATTURATO NEL BLOCCO CATCH !!!");
    console.error(`TIPO DI ERRORE: ${error.name}`);
    console.error(`MESSAGGIO DI ERRORE: ${error.message}`);
    console.error("STACK TRACE COMPLETO:", error.stack);
    // =======================

    let statusCode = 500; // Default: Internal Server Error
    let errorCode = 'PROCESSING_ERROR';
    let errorMessage = 'An error occurred while processing the time request.';

    // Controlla specificamente se l'errore è dovuto a un timezone non valido
    if (error instanceof RangeError && error.message.includes('Invalid time zone')) {
      statusCode = 400; // Bad Request
      errorCode = 'INVALID_TIMEZONE';
      errorMessage = `Invalid or unsupported timezone identifier provided: ${timezoneIdentifier}`;
    }
    
    // Prepara la risposta JSON di errore
    const errorResponse = {
      success: false,
      error_code: errorCode,
      message: errorMessage,
      requested_tz: timezoneIdentifier,
    };

    // Ritorna la risposta di errore
    return {
      statusCode: statusCode,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify(errorResponse),
    };
  }
}
