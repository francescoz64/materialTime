/*
    SCRIPT.JS PER MATERIALTIME - ARCHITETTURA SEMPLIFICATA
    ======================================================
    - Ora NON configurabile dall'utente via WebApp.
    - Timezone è configurabile (tramite <select>).
    - Altre impostazioni (12/24h, alwaysOn, allIN/OUT) sono configurabili.
    - AGGIUNTA: Funzionalità di reset credenziali WiFi dell'ESP32.
*/
document.addEventListener('DOMContentLoaded', () => {
	
	
    // --- STATI APPLICAZIONE ---
    // Definiscono i diversi stati in cui l'applicazione web può trovarsi,
    // utili per controllare il comportamento dell'UI (es. abilitare/disabilitare pulsanti, mostrare spinner).
    const APP_STATES = {
		INITIALIZING: 'INITIALIZING',         // In attesa del sessionId
		WAITING_FOR_STATE: 'WAITING_FOR_STATE',   // In attesa dello stato iniziale dal server
		CONFIGURING: 'CONFIGURING',           // Pronto per l'utente
		SENDING_COMMAND: 'SENDING_COMMAND',     // Invio comando in corso
		ERROR: 'ERROR'                        // Errore critico
	};
	let currentAppState = APP_STATES.INITIALIZING;
	let sessionId = null;
	let responsePollController = null; // Per poter annullare il polling delle risposte
	let lastReceivedClockStatus = null;    
                                        

    // --- ELENCO TIMEZONE CURATO ---
    // Un elenco predefinito di timezone comuni per popolare il <select> nel form.
    const timezonesForSelect = [
        { value: "UTC", text: "Coordinated Universal Time (UTC)" },
        { value: "Europe/London", text: "(GMT+00:00) Londra, Dublino, Lisbona" },
        { value: "Europe/Paris", text: "(GMT+01:00) Parigi, Bruxelles, Amsterdam" },
        { value: "Europe/Berlin", text: "(GMT+01:00) Berlino, Zurigo, Vienna" },
        { value: "Europe/Rome", text: "(GMT+01:00) Roma" },
        { value: "Europe/Madrid", text: "(GMT+01:00) Madrid" },
        { value: "Europe/Athens", text: "(GMT+02:00) Atene, Bucarest, Helsinki" },
        { value: "Europe/Moscow", text: "(GMT+03:00) Mosca, San Pietroburgo" },
        { value: "America/New_York", text: "(GMT-05:00) Eastern Time (New York, Toronto)" },
        { value: "America/Chicago", text: "(GMT-06:00) Central Time (Chicago, Messico City)" },
        { value: "America/Denver", text: "(GMT-07:00) Mountain Time (Denver, Edmonton)" },
        { value: "America/Phoenix", text: "(GMT-07:00) Mountain Time (Phoenix - No DST)" },
        { value: "America/Los_Angeles", text: "(GMT-08:00) Pacific Time (Los Angeles, Vancouver)" },
        { value: "America/Anchorage", text: "(GMT-09:00) Alaska Time (Anchorage)" },
        { value: "Pacific/Honolulu", text: "(GMT-10:00) Hawaii Time (Honolulu - No DST)" },
        { value: "America/Sao_Paulo", text: "(GMT-03:00) San Paolo, Brasilia" },
        { value: "America/Buenos_Aires", text: "(GMT-03:00) Buenos Aires" },
        { value: "America/Bogota", text: "(GMT-05:00) Bogotà, Lima (No DST)" },
        { value: "Asia/Dubai", text: "(GMT+04:00) Dubai, Abu Dhabi" },
        { value: "Asia/Karachi", text: "(GMT+05:00) Karachi, Tashkent" },
        { value: "Asia/Kolkata", text: "(GMT+05:30) India Standard Time (Mumbai, Nuova Delhi)" },
        { value: "Asia/Bangkok", text: "(GMT+07:00) Bangkok, Giacarta, Hanoi" },
        { value: "Asia/Singapore", text: "(GMT+08:00) Singapore, Kuala Lumpur" },
        { value: "Asia/Hong_Kong", text: "(GMT+08:00) Hong Kong, Pechino, Taipei" },
        { value: "Asia/Shanghai", text: "(GMT+08:00) Shanghai" },
        { value: "Asia/Tokyo", text: "(GMT+09:00) Tokyo, Seoul" },
        { value: "Africa/Cairo", text: "(GMT+02:00) Cairo" },
        { value: "Africa/Nairobi", text: "(GMT+03:00) Nairobi" },
        { value: "Africa/Johannesburg", text: "(GMT+02:00) Johannesburg" },
        { value: "Australia/Perth", text: "(GMT+08:00) Western Standard Time (Perth - No DST)" },
        { value: "Australia/Darwin", text: "(GMT+09:30) Central Standard Time (Darwin - No DST)" },
        { value: "Australia/Adelaide", text: "(GMT+09:30) Central Time (Adelaide)" },
        { value: "Australia/Brisbane", text: "(GMT+10:00) Eastern Standard Time (Brisbane - No DST)" },
        { value: "Australia/Sydney", text: "(GMT+10:00) Eastern Time (Sydney, Melbourne)" },
    ];

    // --- ELEMENTI UI PRINCIPALI ---
    // Riferimenti agli elementi DOM per una facile manipolazione.
    const alertPlaceholder = document.getElementById('alert-placeholder');
    const mainContent = document.querySelector('.container.mt-4');
    const initialOverlay = document.getElementById('initial-overlay');
    const initialOverlayMessage = document.getElementById('initial-overlay-message');
    const initialOverlaySpinner = document.getElementById('initial-overlay-spinner');

    // Elementi per visualizzare lo stato attuale dell'orologio
    const refreshStatusBtn = document.getElementById('refresh-status-btn');
    const currentClockTimeEl = document.getElementById('current-clock-time');
    const currentFormat12hEl = document.getElementById('current-format12h');
    const currentAlwaysOnEl = document.getElementById('current-alwaysOn');
    const currentOpModeEl = document.getElementById('current-op-mode');
    const currentClockTimezoneEl = document.getElementById('current-clock-timezone');
    const lastStatusTimestampEl = document.getElementById('last-status-timestamp');

    // Elementi del form di configurazione
    const configForm = document.getElementById('config-form');
    const format12hSwitch = document.getElementById('format12h');
    const alwaysOnSwitch = document.getElementById('alwaysOn');
    const timezoneInput = document.getElementById('timezone'); // Ora è un <select>
    const serviceCommandRadios = document.querySelectorAll('input[name="serviceCommand"]');
    const submitConfigBtn = configForm ? configForm.querySelector('button[type="submit"]') : null;

    // Modale di conferma per l'invio della configurazione
    const confirmSubmitModalEl = document.getElementById('confirmSubmitModal');
    let confirmSubmitModal = confirmSubmitModalEl ? new bootstrap.Modal(confirmSubmitModalEl) : null;
    const modalDynamicMessageArea = document.getElementById('modal-dynamic-message-area');
    const proceedWithSubmitBtn = document.getElementById('proceedWithSubmitBtn');
    const modalCloseButton = document.getElementById('modalCloseButton'); // Bottone 'X' del modale
    const cancelSubmitBtn = document.getElementById('cancelSubmitBtn');   // Bottone 'Annulla' del modale

    // Elementi per la funzionalità di Reset WiFi
    const resetWifiCredentialsBtn = document.getElementById('resetWifiCredentialsBtn');
    const confirmResetWifiModalEl = document.getElementById('confirmResetWifiModal');
    let confirmResetWifiModal = confirmResetWifiModalEl ? new bootstrap.Modal(confirmResetWifiModalEl) : null;
    const proceedWithWifiResetBtn = document.getElementById('proceedWithWifiResetBtn');
    const cancelResetWifiBtn = document.getElementById('cancelResetWifiBtn'); // Bottone 'Annulla' del modale reset WiFi
    const closeResetWifiModalBtn = document.getElementById('closeResetWifiModalBtn'); // Bottone 'X' del modale reset WiFi


    if (document.getElementById('current-year')) {
        document.getElementById('current-year').textContent = new Date().getFullYear();
    }

// ******************************************************
// GRUPPO: FUNZIONI DI COMUNICAZIONE CON IL BACKEND (API LAYER)
// Questo gruppo contiene tutte le funzioni che si occupano esclusivamente di parlare con il server Netlify. È il "livello API" della tua webapp.
// ******************************************************

	async function sendCommandToServer(command, payload = {}) {
		
		
		if (!sessionId) {
			showAlert("Errore: ID di sessione non valido.", 'danger');
			return false;
		}
		console.log(`Sending command '${command}' to server...`, payload);
		try {
			const response = await fetch('/.netlify/functions/sendCommand', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ sessionId, command, payload })
			});
			return response.ok;
		} catch (error) {
			showAlert(`Errore di comunicazione: ${error.message}`, 'danger');
			return false;
		}
		
	}
	
	
	

	async function startPollingForResponses() {
		
		
		if (responsePollController) responsePollController.abort();
		responsePollController = new AbortController();
		const signal = responsePollController.signal;

		console.log("Starting to poll for device responses...");

		while (!signal.aborted) {
			try {
				const response = await fetch(`/.netlify/functions/pollForResponse?session_id=${sessionId}`, { signal });
				if (signal.aborted) break;

				if (response.status === 200) {
					const data = await response.json();
					if (data.type === 'STATE_UPDATE') {
						console.log("Received state update from device:", data.payload);
						handleClockData(data.payload); // handleClockData è la tua funzione originale!
					} else if (data.type === 'ACK') {
						console.log("Received ACK from device for command:", data.command);
						showAlert(`Comando confermato con successo dall'orologio!`, 'success');
					} else if (data.type === 'NACK') {
						 showAlert(`L'orologio ha risposto con un errore (NACK).`, 'warning');
					}
				} else if (response.status !== 204) {
					throw new Error(`Stato server: ${response.status}`);
				}
			} catch (error) {
				if (!signal.aborted) {
					setAppState(APP_STATES.ERROR);
					showAlert("Connessione con l'orologio interrotta.", 'danger');
					responsePollController.abort();
				}
			}
		}
		
	}	
		




// ******************************************************
// GRUPPO: FUNZIONI DI GESTIONE DELLA UI (UI LAYER)
// Questo gruppo contiene le funzioni che manipolano direttamente il DOM, mostrando o nascondendo elementi, aggiornando testo e valori.
// ******************************************************
  
    // Questa funzione chiama il nostro nuovo server Netlify, ottiene l'ora
    // e la restituisce. Gestisce anche gli errori.
    async function fetchCurrentTimeFromServer(timezone) {
		
		
        // Usa il percorso relativo che funzionerà sia in locale (netlify dev) che in produzione.
        const serverUrl = `/.netlify/functions/getTime?tz=${encodeURIComponent(timezone)}`;
        console.log(`Richiesta ora corrente al server Netlify per timezone: ${timezone}`);

        try {
            const response = await fetch(serverUrl, { signal: AbortSignal.timeout(8000) }); // Timeout 8s
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.message || 'Errore sconosciuto dal server ora.');
            }
            const timeData = await response.json();
            if (timeData.success) {
                return timeData.datetime; // Restituisce solo la stringa "YYYY-MM-DD HH:MM:SS"
            } else {
                throw new Error(timeData.message || 'Il server ha restituito un errore.');
            }
        } catch (error) {
            console.error("Errore nel fetch dell'ora dal server Netlify:", error);
            showAlert(`Impossibile sincronizzare l'ora dal server: ${error.message}`, 'danger');
            return null; // Restituisce null in caso di fallimento
        }
		
    }

   	
	
	
    // --- GESTIONE STATI UI ---
    // Aggiorna l'interfaccia utente in base allo stato corrente dell'applicazione.
	function setAppState(newState) {
		
		
		console.log("App state changing from:", currentAppState, "to:", newState);
        currentAppState = newState;

		// Gestione Overlay (per attesa dati iniziali) e Main Content
		if (newState === APP_STATES.WAITING_FOR_DATA) {
			if (initialOverlay) initialOverlay.classList.remove('d-none');
			if (mainContent) mainContent.classList.add('d-none');
			if (initialOverlayMessage) initialOverlayMessage.textContent = "In attesa di dati dall'orologio...";
			if (initialOverlaySpinner) initialOverlaySpinner.style.display = 'block';
		} else { // Per tutti gli altri stati, l'overlay iniziale è nascosto e il contenuto principale è visibile
			if (initialOverlay) initialOverlay.classList.add('d-none');
			if (mainContent) mainContent.classList.remove('d-none');
		}

		// Abilitazione/Disabilitazione Pulsanti Principali
        // I pulsanti sono attivi solo nello stato CONFIGURING.
		const buttonsShouldBeEnabled = (newState === APP_STATES.CONFIGURING);
		if (submitConfigBtn) submitConfigBtn.disabled = !buttonsShouldBeEnabled;
		if (refreshStatusBtn) refreshStatusBtn.disabled = !buttonsShouldBeEnabled;
		if (resetWifiCredentialsBtn) resetWifiCredentialsBtn.disabled = !buttonsShouldBeEnabled;

		// Gestione Spinner per pulsanti specifici in base allo stato
		if (submitConfigBtn) {
			showButtonSpinner(submitConfigBtn, newState === APP_STATES.SENDING_CONFIG, "Invio...");
		}
        // Lo spinner per proceedWithWifiResetBtn è gestito direttamente nella sua logica.
		
        // Gestione Modali
		if (newState === APP_STATES.CONFIRMING_SUBMIT) {
			if (confirmSubmitModal) confirmSubmitModal.show();
		} else if (newState === APP_STATES.CONFIRMING_WIFI_RESET) {
            if (confirmResetWifiModal) confirmResetWifiModal.show();
        }
	}

    // --- LOGICA COMANDI DI SERVIZIO (allIN, allOUT, TimeMode) ---
    // Abilita il pulsante di invio se un comando di servizio viene selezionato (e siamo in stato CONFIGURING).
    if (serviceCommandRadios) {
        serviceCommandRadios.forEach(radio => radio.addEventListener('change', () => {
            if (submitConfigBtn && currentAppState === APP_STATES.CONFIGURING) {
                submitConfigBtn.disabled = false; // Normalmente non necessario se setAppState lo gestisce, ma per sicurezza.
            }
        }));
		
    }




    // Mostra/Nasconde uno spinner su un pulsante e ne disabilita/abilita l'interazione.
    function showButtonSpinner(buttonElement, show = true, spinnerText = "Attendere...") {
		
		
        if (!buttonElement) return;
        if (show) {
            if (!buttonElement.dataset.originalContent) { // Salva il contenuto originale solo la prima volta
                buttonElement.dataset.originalContent = buttonElement.innerHTML;
            }
            buttonElement.disabled = true;
            buttonElement.innerHTML = `<span class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></span> ${spinnerText}`;
        } else {
            buttonElement.disabled = false;
            if (buttonElement.dataset.originalContent) { // Ripristina il contenuto originale
                buttonElement.innerHTML = buttonElement.dataset.originalContent;
            }
            // Non è necessario resettare buttonElement.dataset.originalContent, può essere riutilizzato
        }
		
    }
    
	


    // --- FUNZIONE PER POPOLARE IL SELECT DEI TIMEZONE ---
    function populateTimezoneSelect() {

		
        if (timezoneInput && timezoneInput.tagName === 'SELECT') {
            timezoneInput.innerHTML = ''; // Pulisci opzioni esistenti
            timezonesForSelect.forEach(tz => {
                const option = document.createElement('option');
                option.value = tz.value;
                option.textContent = tz.text;
                timezoneInput.appendChild(option);
            });
            console.log("Select dei timezone popolato.");
        } else if (timezoneInput) {
            console.warn("L'elemento con id='timezone' NON è un tag SELECT come atteso. Impossibile popolare l'elenco.");
        } else {
            console.warn("Elemento con id='timezone' NON TROVATO. Impossibile popolare l'elenco dei timezone.");
        }
		
    }


	

    // --- FUNZIONI PER POPOLARE I CAMPI ---
    // Popola i campi di visualizzazione dello stato dell'orologio.
    function populateStatusFields(statusData) {
		
		
        lastReceivedClockStatus = statusData; // Aggiorna lo stato globale
        if (statusData) {
            if(currentClockTimeEl) currentClockTimeEl.textContent = formatDateTimeForDisplay(statusData.datetime);
            if(currentFormat12hEl) currentFormat12hEl.textContent = statusData.format12h ? '12 Ore (AM/PM)' : '24 Ore';
            if(currentAlwaysOnEl) currentAlwaysOnEl.textContent = statusData.alwaysOn ? 'Sì' : 'No';
            if(currentClockTimezoneEl) currentClockTimezoneEl.textContent = statusData.timezone || "N/D";
            if(currentOpModeEl) {
                if (statusData.allIN === true) currentOpModeEl.textContent = 'ALL IN';
                else if (statusData.allOUT === true) currentOpModeEl.textContent = 'ALL OUT';
                else currentOpModeEl.textContent = 'Time Mode';
            }
            if(lastStatusTimestampEl) lastStatusTimestampEl.textContent = new Date().toLocaleString('it-IT') + " (dati ricevuti ora)";
        } else { // Se non ci sono dati, mostra "N/D"
            if(currentClockTimeEl) currentClockTimeEl.textContent = "N/D";
            if(currentFormat12hEl) currentFormat12hEl.textContent = "N/D";
            if(currentAlwaysOnEl) currentAlwaysOnEl.textContent = "N/D";
            if(currentOpModeEl) currentOpModeEl.textContent = "N/D";
            if(currentClockTimezoneEl) currentClockTimezoneEl.textContent = "N/D";
            if(lastStatusTimestampEl) lastStatusTimestampEl.textContent = 'Mai';
        }
		
    }




    // Popola i campi del form di configurazione con i dati correnti o default.
    function populateFormFields(statusData) {
		
		
        if (statusData) {
            if(format12hSwitch) format12hSwitch.checked = !!statusData.format12h;
            if(alwaysOnSwitch) alwaysOnSwitch.checked = !!statusData.alwaysOn;
            
            if(timezoneInput && timezoneInput.tagName === 'SELECT') {
                timezoneInput.value = statusData.timezone || "Europe/Rome"; // Default se non presente
                // Verifica se il timezone ricevuto è valido e presente nella lista
                if (!timezonesForSelect.some(tz => tz.value === timezoneInput.value)) {
                    console.warn(`Timezone "${statusData.timezone}" ricevuto non trovato nell'elenco. Imposto default "Europe/Rome".`);
                    timezoneInput.value = "Europe/Rome"; 
                }
            } else if (timezoneInput) { // Fallback se timezoneInput non è un select (improbabile con HTML corretto)
                timezoneInput.value = statusData.timezone || "Europe/Rome";
            }

            // Imposta il radio button del comando di servizio
            const cmdAllIN = document.getElementById('cmd-allIN');
            const cmdAllOUT = document.getElementById('cmd-allOUT');
            const cmdTimeMode = document.getElementById('cmd-timeMode') || document.getElementById('cmd-none'); // 'cmd-none' come fallback

            if (statusData.allIN === true && cmdAllIN) cmdAllIN.checked = true;
            else if (statusData.allOUT === true && cmdAllOUT) cmdAllOUT.checked = true;
            else if (cmdTimeMode) cmdTimeMode.checked = true; // Default a TimeMode se non allIN/allOUT
        } else { // Valori di default per il form se non ci sono dati di stato
            if(format12hSwitch) format12hSwitch.checked = false;
            if(alwaysOnSwitch) alwaysOnSwitch.checked = false;
            if(timezoneInput) timezoneInput.value = "Europe/Rome"; // Default timezone
            const cmdTimeMode = document.getElementById('cmd-timeMode') || document.getElementById('cmd-none');
            if(cmdTimeMode) cmdTimeMode.checked = true; // Default a TimeMode
        }
        // Lo stato del submitConfigBtn è già gestito da setAppState
    }






    // Mostra un alert Bootstrap dinamico.
    function showAlert(message, type = 'info', duration = 7000, dismissible = true) {
		
		
        if (!alertPlaceholder) return;
        const wrapper = document.createElement('div');
        wrapper.innerHTML = [
            `<div class="alert alert-${type} alert-dismissible fade show" role="alert">`,
            `   <i class="bi ${type === 'success' ? 'bi-check-circle-fill' : type === 'danger' ? 'bi-exclamation-triangle-fill' : type === 'warning' ? 'bi-exclamation-diamond-fill' : 'bi-info-circle-fill'} me-2"></i>`,
            `   ${message}`,
            dismissible ? '<button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>' : '',
            '</div>'
        ].join('');
        alertPlaceholder.append(wrapper);
        if (duration && dismissible) { // Solo se dismissible e con durata, altrimenti l'utente chiude manualmente
            setTimeout(() => {
                if (wrapper.parentNode) {
                    wrapper.remove();
                }
            }, duration);
        }
		
    }




	
	
    // Formatta una stringa datetime per la visualizzazione.
    function formatDateTimeForDisplay(dateTimeString) {
		
		
        if (!dateTimeString || dateTimeString === "0000-00-00 00:00:00") return "N/D (ora non impostata/sincronizzata)";
        try {
            const [datePart, timePart] = dateTimeString.split(' ');
            if (!datePart || !timePart) return dateTimeString; // Formato non atteso
            const [year, month, day] = datePart.split('-');
            if (parseInt(year,10) < 2023 && datePart !== "0000-00-00") return "N/D (segnale orologio anomalo)";
            return `${timePart} (${day}/${month}/${year})`;
        } catch (e) { 
            console.warn("Errore formattazione datetime:", dateTimeString, e);
            return dateTimeString; // Restituisce la stringa originale in caso di errore
        }
		
    }





// ******************************************************
// GRUPPO: FUNZIONI DI LOGICA APPLICATIVA (BUSINESS LOGIC LAYER)
// Questo gruppo contiene le funzioni che orchestrano la logica principale dell'applicazione, collegando gli eventi della UI con la comunicazione backend e la gestione dello stato.
// ******************************************************

    // --- GESTIONE DATI DA ESP32 (RICEVUTI VIA URL PARAM O FETCH) ---
    // Verifica che i dati ricevuti siano validi.
	// Crea un oggetto lastReceivedClockStatus pulito, senza più l'inutile esp32_reply_to_endpoint.
	// Usa le tue funzioni populateStatusFields e populateFormFields per aggiornare la UI.
	// Controlla se l'app era nello stato WAITING_FOR_STATE. Se sì, significa che questo è il primo stato ricevuto con successo, 
	// quindi mostra un messaggio di successo e sblocca l'UI impostando lo stato a CONFIGURING. Se no, aggiorna semplicemente i dati senza cambiare lo stato generale dell'app.
	function handleClockData(data) {
		
		console.log("Received data from ESP32 (via server):", data);

		// La verifica di validità dei dati rimane la stessa
		if (data && data.datetime !== undefined) { 
			
			// Normalizza e salva i dati ricevuti.
			// La proprietà 'esp32_reply_to_endpoint' è stata rimossa perché non è più necessaria.
			lastReceivedClockStatus = {
				datetime: data.datetime,
				format12h: !!data.format12h, // Converte a booleano
				alwaysOn: !!data.alwaysOn,   // Converte a booleano
				allIN: !!data.allIN,         // Converte a booleano
				allOUT: !!data.allOUT,       // Converte a booleano
				timezone: data.timezone || "Europe/Rome" // Default se timezone non presente
			};

			// Aggiorna i campi dell'interfaccia utente con i nuovi dati.
			// Queste sono le tue funzioni originali, che vanno bene.
			populateStatusFields(lastReceivedClockStatus);
			populateFormFields(lastReceivedClockStatus);

			// Controlla lo stato attuale dell'app per decidere come procedere.
			// Se stavamo aspettando i dati iniziali, ora possiamo sbloccare l'interfaccia.
			if (currentAppState === APP_STATES.WAITING_FOR_STATE) {
				showAlert('Stato dell\'orologio caricato con successo.', 'success', 5000);
				setAppState(APP_STATES.CONFIGURING); // Transizione allo stato di configurazione.
			}
			
		} else {
			// La gestione dell'errore se i dati non sono validi rimane la stessa.
			showAlert("Dati ricevuti dall'orologio non validi o incompleti.", 'warning', 10000);
			populateStatusFields(null); // Pulisce i campi di stato
			populateFormFields(null);   // Pulisce i campi del form

			// Se eravamo in attesa e falliamo, andiamo in stato di errore.
			if(currentAppState === APP_STATES.WAITING_FOR_STATE) {
				 setAppState(APP_STATES.ERROR);
			}
		}
	}

   
   
 
   
   
   
    // --- LOGICA DI AVVIO DELL'APPLICAZIONE ---
    // Carica lo stato iniziale dai parametri dell'URL (metodo per produzione quando la WebApp è hostata esternamente).
    function initializeApp() {
		
		
		populateTimezoneSelect(); // Questa è la tua funzione originale, va bene
		const urlParams = new URLSearchParams(window.location.search);
		sessionId = urlParams.get('session_id');

		if (!sessionId) {
			setAppState(APP_STATES.ERROR);
			if (initialOverlayMessage) {
				initialOverlayMessage.textContent = "Errore: ID di sessione non trovato. Accedi tramite il redirect del tuo orologio.";
			}
			if (initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';
			return;
		}

		console.log("App initialized with session ID:", sessionId);
		setAppState(APP_STATES.WAITING_FOR_STATE);
		if (initialOverlayMessage) initialOverlayMessage.textContent = "In attesa dello stato dall'orologio...";
		
		// Richiedi lo stato iniziale inviando un comando al server
		sendCommandToServer('GET_STATE');
		
		// E inizia subito ad ascoltare le risposte
		startPollingForResponses();
		
	}





// ******************************************************
// GRUPPO: EVENT LISTENERS
// Questo blocco, solitamente alla fine del file, contiene tutto il codice che attacca gli handler agli eventi del DOM (click, submit, ecc.).
// ******************************************************


    // Event listener per il caricamento della pagina: punto di ingresso principale.
	window.addEventListener('load', () => {
		console.log("Window loaded. Initializing app...");
		initializeApp();
	});




    // --- GESTIONE INVIO CONFIGURAZIONE (SUBMIT DEL FORM) ---
    if(configForm) {
        configForm.addEventListener('submit', (event) => {
            event.preventDefault(); // Impedisce l'invio standard del form
            if (currentAppState !== APP_STATES.CONFIGURING) {
                showAlert("Attendere il completamento dell'operazione corrente o il caricamento dello stato.", "warning");
                return;
            }
            // Prepara il messaggio per il modale di conferma
            let modalMessages = `<p>Stai per inviare la seguente configurazione all'orologio. Assicurati che sia in modalità 'Setup' e connesso alla tua rete WiFi.</p>
                                 <p class="text-info-emphasis"><i class="bi bi-info-circle-fill me-1"></i>Verrà sincronizzata anche l'ora corrente per il timezone selezionato.</p>`;
            if(modalDynamicMessageArea) modalDynamicMessageArea.innerHTML = modalMessages;
            setAppState(APP_STATES.CONFIRMING_SUBMIT);
        });
		
    }




	//  L'utente preme "Invia", la UI si blocca, riceve subito un messaggio "Comando inviato. In attesa di conferma...". 
	// Poi, qualche secondo dopo (il tempo che l'ESP32 faccia il polling, esegua il comando e invii la risposta), 
	// riceverà un secondo alert "Comando confermato con successo!" generato dalla funzione startPollingForResponses.
	if (proceedWithSubmitBtn) {
		proceedWithSubmitBtn.addEventListener('click', async () => {
			// Controllo di sicurezza, rimane invariato
			if (currentAppState !== APP_STATES.CONFIRMING_SUBMIT) return;

			// Imposta lo stato di invio e nasconde il modale
			setAppState(APP_STATES.SENDING_COMMAND);
			if (confirmSubmitModal) confirmSubmitModal.hide();

			// 1. La logica per ottenere l'ora corrente dal server Netlify rimane IDENTICA.
			//    È una buona pratica perché garantisce che l'ora inviata sia sempre precisa.
			const selectedTimezone = timezoneInput.value;
			showAlert(`Sincronizzazione ora per ${selectedTimezone}...`, 'info', 4000);
			const currentDateTime = await fetchCurrentTimeFromServer(selectedTimezone);
			
			// Se il sync dell'ora fallisce, annulliamo l'operazione. Invariato.
			if (currentDateTime === null) {
				showAlert("Invio configurazione annullato: impossibile sincronizzare l'ora.", "warning");
				setAppState(APP_STATES.CONFIGURING);
				return;
			}

			showAlert("Ora sincronizzata. Invio della nuova configurazione all'orologio...", 'info', 5000);

			// 2. La costruzione del payload JSON rimane IDENTICA.
			const selectedServiceCommandRadio = document.querySelector('input[name="serviceCommand"]:checked');
			const selectedServiceCommandValue = selectedServiceCommandRadio ? selectedServiceCommandRadio.value : 'none';
			
			const payload = {
				datetime: currentDateTime,
				format12h: format12hSwitch.checked,
				alwaysOn: alwaysOnSwitch.checked,
				timezone: selectedTimezone,
				allIN: (selectedServiceCommandValue === 'allIN'),
				allOUT: (selectedServiceCommandValue === 'allOUT')
			};

			// 3. SOSTITUZIONE DELLA LOGICA DI INVIO.
			//    Tutta la vecchia logica 'try/catch' con 'fetch' diretto viene sostituita
			//    da una singola chiamata alla nostra nuova funzione helper.
			const success = await sendCommandToServer('SET_CONFIG', payload);

			// 4. GESTIONE DEL RISULTATO (ASINCRONO)
			if (success) {
				// Messaggio per l'utente: il comando è stato ACCETTATO dal server, non ancora
				// eseguito dall'orologio. La conferma arriverà tramite il polling.
				showAlert("Comando inviato correttamente. In attesa di conferma dall'orologio...", "info", 8000);
			} else {
				// Se 'sendCommandToServer' fallisce, significa che c'è stato un problema
				// di comunicazione con il server Netlify.
				showAlert("Errore: impossibile inviare il comando al server. Controlla la tua connessione internet.", "danger");
			}
			
			// 5. GESTIONE DELLO STATO UI
			// Non torniamo immediatamente allo stato 'CONFIGURING'. 
			// L'UI rimarrà "bloccata" (pulsanti disabilitati) finché non arriva una risposta
			// o scatta un timeout, per evitare che l'utente invii comandi multipli.
			// Aggiungiamo un timeout di sicurezza per sbloccare la UI se non arriva mai una risposta.
			setTimeout(() => {
				if (currentAppState === APP_STATES.SENDING_COMMAND) {
					console.warn("Nessuna conferma ricevuta dall'orologio. Sblocco della UI per timeout.");
					setAppState(APP_STATES.CONFIGURING);
				}
			}, 15000); // Sblocca la UI dopo 15 secondi se non è successo nulla
		});
	}




    // --- Pulsante Aggiorna Stato ---
    // invia un comando al server invece di contattare direttamente l'ESP32.
    if (refreshStatusBtn) {
		refreshStatusBtn.addEventListener('click', async () => {
			if (currentAppState !== APP_STATES.CONFIGURING) {
				showAlert("Attendere il completamento dell'operazione corrente.", "warning");
				return;
			}
			console.log("Refresh status button clicked");
			showButtonSpinner(refreshStatusBtn, true, "Richiedo...");

			const success = await sendCommandToServer('GET_STATE');

			if (success) {
				showAlert("Richiesta di stato inviata. In attesa di risposta...", "info");
			} else {
				showAlert("Impossibile inviare la richiesta di stato al server.", "danger");
			}

			// Lo spinner verrà rimosso automaticamente quando lo stato cambia
			// o dopo un timeout per sicurezza.
			setTimeout(() => showButtonSpinner(refreshStatusBtn, false), 5000);
		});
	}




    // --- GESTIONE RESET WIFI ---
    // Apre il modale di conferma per il reset delle credenziali WiFi.
    if (resetWifiCredentialsBtn) {
        resetWifiCredentialsBtn.addEventListener('click', () => {
            if (currentAppState !== APP_STATES.CONFIGURING) {
                showAlert("Attendi il completamento di altre operazioni o il caricamento dello stato prima di resettare il WiFi.", "warning");
                return;
            }
            // Resetta lo stato del pulsante del modale (rimuovi spinner se presente da un tentativo precedente)
            showButtonSpinner(proceedWithWifiResetBtn, false); // Assicura che il pulsante nel modale sia normale
            setAppState(APP_STATES.CONFIRMING_WIFI_RESET); // Mostra il modale di conferma reset WiFi
        });
		
    }





	// --- Azione quando l'utente conferma il reset WiFi dal modale ---
	if (proceedWithWifiResetBtn) {
		proceedWithWifiResetBtn.addEventListener('click', async () => {
			if (currentAppState !== APP_STATES.CONFIRMING_WIFI_RESET) return;

			setAppState(APP_STATES.SENDING_COMMAND); // Usa uno stato generico di invio
			showButtonSpinner(proceedWithWifiResetBtn, true, "Invio...");
			
			const success = await sendCommandToServer('RESET_WIFI');

			if (confirmResetWifiModal) confirmResetWifiModal.hide();
			
			if (success) {
				// Poiché il reset del WiFi fa riavviare l'ESP32, non riceveremo mai un ACK.
				// Quindi, mostriamo subito il messaggio di successo e istruzioni all'utente.
				showAlert(
					"<strong>Comando di reset WiFi inviato!</strong><br>" +
					"materialTime si riavvierà in modalità Access Point (AP). " +
					"Questa pagina perderà la connessione. Segui le istruzioni sul dispositivo per riconfigurare la rete WiFi.",
					'success', 60000, false
				);

				// Ferma il polling e resetta l'UI perché la sessione è terminata
				if (responsePollController) responsePollController.abort();
				sessionId = null;
				lastReceivedClockStatus = null;
				populateStatusFields(null);
				populateFormFields(null);
				setAppState(APP_STATES.ERROR);
				if(initialOverlayMessage) initialOverlayMessage.textContent = "Sessione terminata. Riconfigura l'orologio e accedi di nuovo tramite il suo redirect.";
				if(initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';

			} else {
				showAlert("Errore: impossibile inviare il comando di reset al server.", "danger");
				setAppState(APP_STATES.CONFIGURING);
			}
			
			showButtonSpinner(proceedWithWifiResetBtn, false);
		});
	}




    // --- GESTIONE CHIUSURA MODALI ---
    // Gestori per i pulsanti di chiusura/annulla dei modali e per l'evento 'hidden.bs.modal'.

    // Modale di conferma invio configurazione
    if(modalCloseButton) modalCloseButton.addEventListener('click', () => { if(confirmSubmitModal) confirmSubmitModal.hide(); });
    if(cancelSubmitBtn) cancelSubmitBtn.addEventListener('click', () => { if(confirmSubmitModal) confirmSubmitModal.hide(); });
    if(confirmSubmitModalEl) {
        confirmSubmitModalEl.addEventListener('hidden.bs.modal', () => {
            // Quando il modale è nascosto, se non stiamo inviando, torna a CONFIGURING.
            if (currentAppState === APP_STATES.CONFIRMING_SUBMIT) {
                setAppState(APP_STATES.CONFIGURING);
            }
        });
    }

    // Modale di conferma reset WiFi
    if(closeResetWifiModalBtn) closeResetWifiModalBtn.addEventListener('click', () => { if(confirmResetWifiModal) confirmResetWifiModal.hide(); });
    if(cancelResetWifiBtn) cancelResetWifiBtn.addEventListener('click', () => { if(confirmResetWifiModal) confirmResetWifiModal.hide(); });
    if(confirmResetWifiModalEl) {
        confirmResetWifiModalEl.addEventListener('hidden.bs.modal', () => {
            // Quando il modale è nascosto, se non stiamo inviando il reset, torna a CONFIGURING.
            if (currentAppState === APP_STATES.CONFIRMING_WIFI_RESET) {
                setAppState(APP_STATES.CONFIGURING);
            }
        });
    }

    // Inizializzazione UI e stato iniziale già gestita in window.addEventListener('load', ...)
}); // Fine DOMContentLoaded