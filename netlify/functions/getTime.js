import { utcToZonedTime, format } from 'date-fns-tz';

// La funzione handler che Netlify eseguirà
export async function handler(event, context) {
  // Ottieni il parametro 'tz' dalla query string. Netlify lo rende disponibile in event.queryStringParameters
  // Se non è fornito o è una stringa vuota, usa 'UTC' come default.
  let timezoneIdentifier = event.queryStringParameters.tz || 'UTC';
  if (typeof timezoneIdentifier !== 'string' || timezoneIdentifier.trim() === '') {
    timezoneIdentifier = 'UTC';
  }

  try {
    // Il "try-catch" in date-fns-tz gestisce i timezone non validi.
    // utcToZonedTime lancerà un'eccezione RangeError se il timezone non è riconosciuto.
    
    // 1. Ottieni l'ora corrente (oggetti Date in JS sono sempre in UTC)
    const nowUtc = new Date();

    // 2. Converti l'ora UTC nella timezone specificata
    const nowInTimezone = utcToZonedTime(nowUtc, timezoneIdentifier);

    // 3. Formatta la data e l'ora come richiesto
    const formattedDateTime = format(nowInTimezone, 'yyyy-MM-dd HH:mm:ss', {
      timeZone: timezoneIdentifier,
    });

    // 4. Prepara la risposta JSON di successo
    const response = {
      success: true,
      datetime: formattedDateTime,
      timezone_used: timezoneIdentifier, // date-fns-tz non ha un metodo .getName() come Carbon, ma il tz usato è quello richiesto se valido.
    };

    // 5. Ritorna la risposta
    return {
      statusCode: 200, // OK
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*' // Utile per test, anche se non strettamente necessario con percorsi relativi
      },
      body: JSON.stringify(response),
    };

  } catch (error) {
    let statusCode = 500; // Default: Internal Server Error
    let errorCode = 'PROCESSING_ERROR';
    let errorMessage = 'An error occurred while processing the time request.';

    // Controlla specificamente se l'errore è dovuto a un timezone non valido
    if (error instanceof RangeError && error.message.includes('Invalid time zone')) {
      statusCode = 400; // Bad Request
      errorCode = 'INVALID_TIMEZONE';
      errorMessage = `Invalid or unsupported timezone identifier provided: ${timezoneIdentifier}`;
    } else {
      // Per tutti gli altri errori imprevisti
      console.error("Time API Error (General Exception):", error);
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