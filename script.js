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
        WAITING_FOR_DATA: 'WAITING_FOR_DATA',     // In attesa di dati iniziali dall'orologio o da un parametro URL.
        CONFIGURING: 'CONFIGURING',               // Pronto per l'utente per modificare le configurazioni.
        CONFIRMING_SUBMIT: 'CONFIRMING_SUBMIT',   // Modale di conferma mostrato prima di inviare la configurazione.
        SENDING_CONFIG: 'SENDING_CONFIG',         // Invio della configurazione all'ESP32 in corso.
        CONFIRMING_WIFI_RESET: 'CONFIRMING_WIFI_RESET', // Modale di conferma mostrato prima di resettare il WiFi.
        SENDING_WIFI_RESET: 'SENDING_WIFI_RESET'    // Invio del comando di reset WiFi all'ESP32 in corso.
    };
    let currentAppState = APP_STATES.WAITING_FOR_DATA; // Stato iniziale dell'applicazione.
    let lastReceivedClockStatus = null; // Oggetto che memorizza l'ultimo stato ricevuto dall'orologio.
    let esp32ConfigEndpoint = null;     // URL dell'endpoint di configurazione dell'ESP32 (es. http://<IP>/config).
                                        // Può essere ricevuto via parametro URL o inserito dall'utente.

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





    // --- FUNZIONI HELPER ---
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





    // --- GESTIONE DATI DA ESP32 (RICEVUTI VIA URL PARAM O FETCH) ---
    // Processa i dati di stato ricevuti dall'orologio.
    function handleClockData(data) {
		
		
        console.log("Received data from ESP32 (or mock):", data);
        if (data && data.datetime !== undefined) { // Verifica minima di validità dei dati
            // Normalizza e salva i dati ricevuti
            lastReceivedClockStatus = {
                datetime: data.datetime,
                format12h: !!data.format12h, // Converte a booleano
                alwaysOn: !!data.alwaysOn,   // Converte a booleano
                allIN: !!data.allIN,         // Converte a booleano
                allOUT: !!data.allOUT,       // Converte a booleano
                timezone: data.timezone || "Europe/Rome", // Default se timezone non presente
                esp32_reply_to_endpoint: data.esp32_reply_to_endpoint // Può essere undefined
            };

            if (lastReceivedClockStatus.esp32_reply_to_endpoint) { 
                 esp32ConfigEndpoint = lastReceivedClockStatus.esp32_reply_to_endpoint;
                 console.log("Received ESP32 reply endpoint, now set to:", esp32ConfigEndpoint);
            } else {
                console.warn("Nessun esp32_reply_to_endpoint ricevuto. L'utente dovrà inserire l'URL manualmente se non impostato.");
                // Se non c'è endpoint, la WebApp dovrà chiederlo all'utente (gestito più avanti).
            }

            populateStatusFields(lastReceivedClockStatus);
            populateFormFields(lastReceivedClockStatus);
            showAlert('Stato MaterialTime caricato con successo.', 'success', 5000);
            setAppState(APP_STATES.CONFIGURING); // Transizione allo stato di configurazione
        } else {
            showAlert("Dati ricevuti da MaterialTime non validi o incompleti.", 'warning', 10000);
            populateStatusFields(null); // Pulisce i campi di stato
            populateFormFields(null);   // Pulisce i campi del form
            setAppState(APP_STATES.WAITING_FOR_DATA); // Rimane in attesa o torna in attesa
        }
		
    }
   
   
   
   
   
    // --- LOGICA DI AVVIO DELL'APPLICAZIONE ---
    // Tenta di caricare lo stato iniziale da un mock server (per test locali).
    async function fetchInitialStatusForMockTest() {
		
		
        setAppState(APP_STATES.WAITING_FOR_DATA); // Assicura che l'overlay sia mostrato
        if(initialOverlayMessage) initialOverlayMessage.textContent = "Caricamento stato iniziale dal mock server...";

        try {
            // NOTA: L'URL del mock server potrebbe cambiare.
            const response = await fetch(`http://localhost:3000/status`); 
            if (!response.ok) throw new Error(`Errore HTTP: ${response.status} - ${response.statusText}`);
            const clockData = await response.json();
            handleClockData(clockData); // Processa i dati ricevuti
        } catch (e) {
            console.error("Errore nel caricare lo stato iniziale dal mock server:", e);
            showAlert(`Errore nel caricare lo stato iniziale dal mock server: ${e.message}`, "danger", 10000);
            if(initialOverlayMessage) initialOverlayMessage.textContent = `Errore caricamento: ${e.message}. Riprova o controlla il mock server.`;
            if(initialOverlaySpinner) initialOverlaySpinner.style.display = 'none'; // Nascondi spinner in caso di errore
            // Lo stato rimane WAITING_FOR_DATA.
        }
		
    }





    // Carica lo stato iniziale dai parametri dell'URL (metodo per produzione quando la WebApp è hostata esternamente).
    function fetchInitialStatusFromURLParams() {
		
		
        setAppState(APP_STATES.WAITING_FOR_DATA);
        if(initialOverlayMessage) initialOverlayMessage.textContent = "In attesa dei dati dall'orologio (parametro URL)...";

        const urlParams = new URLSearchParams(window.location.search);
        const statusParam = urlParams.get('status'); // L'ESP32 reindirizza qui con ?status={...JSON...}
        
        if (statusParam) {
            if(initialOverlayMessage) initialOverlayMessage.textContent = "Elaborazione dati dall'orologio...";
            try {
                const clockData = JSON.parse(decodeURIComponent(statusParam)); // Decodifica e parsa il JSON
                handleClockData(clockData);
            } catch (e) {
                console.error("Error parsing status from URL param:", e);
                showAlert("Errore nel leggere i dati iniziali dall'orologio (parametro URL).", "danger", 10000);
                if(initialOverlayMessage) initialOverlayMessage.textContent = "Errore: dati dall'orologio non validi.";
                if(initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';
                populateFormFields(null); // Popola form con default
            }
        } else {
           // Questo caso è normale se l'utente apre la WebApp direttamente senza essere reindirizzato dall'ESP32.
           showAlert("Nessun dato di stato iniziale ricevuto (parametro 'status' mancante). L'utente potrebbe dover aggiornare manualmente o fornire l'URL dell'ESP32.", "info", 10000);
           if(initialOverlayMessage) initialOverlayMessage.textContent = "Nessun dato iniziale. Attendi connessione ESP32, usa 'Aggiorna Stato', o fornisci il parametro 'status' nell'URL.";
           if(initialOverlaySpinner) initialOverlaySpinner.style.display = 'none';
           populateFormFields(null); // Popola form con default
           setAppState(APP_STATES.CONFIGURING); // Consente all'utente di interagire (es. refresh o inserire URL)
        }
		
    }





    // Event listener per il caricamento della pagina: punto di ingresso principale.
    window.addEventListener('load', () => {
		
		
        console.log("Window loaded. Initializing app...");
        populateTimezoneSelect(); // Popola il <select> dei timezone immediatamente.

        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!
        // DECIDI QUALE LOGICA DI AVVIO USARE:
        // - fetchInitialStatusForMockTest(): Per testare con un server mock locale.
        // - fetchInitialStatusFromURLParams(): Per produzione (quando l'ESP32
        //   potrebbe reindirizzare a questa pagina con i dati di stato nell'URL,
        //   o se la pagina è servita direttamente dall'ESP32).
        // !!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!

        const useMockServer = false; // Cambia a true per testare con il mock server

        if (useMockServer) {
            fetchInitialStatusForMockTest();
        } else {
            // Se la WebApp è servita dall'ESP32 stesso, non ci sarà un parametro 'status' nell'URL iniziale.
            // L'utente dovrà probabilmente premere "Aggiorna Stato" o l'ESP32 dovrà inviare lo stato
            // in qualche altro modo (non implementato qui, si affida al refresh manuale o al prompt per l'URL).
            fetchInitialStatusFromURLParams(); 
        }
		
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
            let modalMessages = `<p>Stai per inviare la seguente configurazione all'orologio. Assicurati che sia in modalità 'Setup' e connesso alla tua rete WiFi.</p>`;
            // Potresti aggiungere un riepilogo delle modifiche qui se lo desideri.
            if(modalDynamicMessageArea) modalDynamicMessageArea.innerHTML = modalMessages;
            setAppState(APP_STATES.CONFIRMING_SUBMIT); // Mostra il modale di conferma
        });
		
    }




    // Azione quando l'utente conferma l'invio dal modale
    if(proceedWithSubmitBtn) {
		
		
        proceedWithSubmitBtn.addEventListener('click', async () => {
            if (currentAppState !== APP_STATES.CONFIRMING_SUBMIT) return; // Sicurezza aggiuntiva
            
            setAppState(APP_STATES.SENDING_CONFIG); // Imposta lo stato di invio (mostra spinner sul bottone principale)
            if(confirmSubmitModal) confirmSubmitModal.hide(); // Nasconde il modale

            const selectedServiceCommandRadio = document.querySelector('input[name="serviceCommand"]:checked');
            const selectedServiceCommandValue = selectedServiceCommandRadio ? selectedServiceCommandRadio.value : 'none';
            
            // Costruisce il payload JSON da inviare all'ESP32
            const payload = {
                // L'ora ("datetime") non è inviata dalla WebApp in questo design, l'ESP32 la sincronizza separatamente.
                // Ma l'endpoint dell'ESP32 potrebbe aspettarselo, quindi inviamo un placeholder.
                datetime: "0000-00-00 00:00:00", 
                format12h: format12hSwitch.checked,
                alwaysOn: alwaysOnSwitch.checked,
                timezone: timezoneInput.value, 
                allIN: (selectedServiceCommandValue === 'allIN'),
                allOUT: (selectedServiceCommandValue === 'allOUT')
                // L'ESP32 si occuperà di salvare il timezone nella sua NVS se modificato.
            };

            let targetUrl = esp32ConfigEndpoint; // Usa l'endpoint salvato se disponibile
            if (!targetUrl) { // Se l'endpoint non è noto, chiedilo all'utente
                targetUrl = prompt("URL dell'ESP32 per la configurazione non rilevato. Inserisci l'URL completo (es. http://192.168.1.XX/config o http://materialtime.local/config):", "http://materialtime.local/config");
            }
            
            if (!targetUrl) { // Se l'utente annulla il prompt
                showAlert("URL di configurazione ESP32 non fornito. Invio annullato.", "warning");
                setAppState(APP_STATES.CONFIGURING); // Torna allo stato di configurazione
                return;
            }

            try {
                console.log("Invio configurazione a:", targetUrl, "Payload:", payload);
                const response = await fetch(targetUrl, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload),
                    signal: AbortSignal.timeout(15000) // Timeout di 15 secondi per la richiesta
                });

                let responseBodyForAlert = "";
                try { responseBodyForAlert = await response.text(); } catch(e) { responseBodyForAlert = "(impossibile leggere corpo risposta)";}

                if (!response.ok) {
                    throw new Error(`Errore ${response.status}: ${response.statusText}. Risposta: ${responseBodyForAlert}`);
                }
                
                console.log("Risposta testuale da ESP32 (o mock):", responseBodyForAlert);

                // Controlla se la risposta contiene un "ACK" (o simile) per conferma
                if (responseBodyForAlert.toLowerCase().includes("ack") || responseBodyForAlert.toLowerCase().includes("ok")) {
                     showAlert("Configurazione inviata con successo e confermata dall'orologio!", 'success', 7000);
                } else {
                     showAlert(`Configurazione inviata, ma la risposta dall'orologio è inattesa: ${responseBodyForAlert}`, 'warning', 10000);
                }

                // Aggiorna l'interfaccia utente con i valori appena inviati (ottimismo UI)
                // Questo presume che l'ESP32 abbia accettato le modifiche.
                const newStatusForUI = { ...(lastReceivedClockStatus || {}) }; // Copia lo stato precedente o un oggetto vuoto
                newStatusForUI.datetime = lastReceivedClockStatus ? lastReceivedClockStatus.datetime : "0000-00-00 00:00:00"; // L'ora non cambia da qui
                newStatusForUI.format12h = payload.format12h;
                newStatusForUI.alwaysOn = payload.alwaysOn;
                newStatusForUI.timezone = payload.timezone;
                newStatusForUI.allIN = payload.allIN;
                newStatusForUI.allOUT = payload.allOUT;

                populateStatusFields(newStatusForUI); // Aggiorna i campi di stato
                // populateFormFields(newStatusForUI); // Non strettamente necessario ripopolare il form se i valori sono già lì
                lastReceivedClockStatus = newStatusForUI; // Aggiorna lo stato locale

            } catch (error) {
                console.error("Errore invio configurazione:", error);
                showAlert(`Errore durante l'invio della configurazione: ${error.message}`, 'danger', 10000);
            } finally {
                // Indipendentemente dal successo o fallimento, torna allo stato di configurazione
                setAppState(APP_STATES.CONFIGURING);
            }
        });
		
    }




    // --- Pulsante Aggiorna Stato ---
    // Permette all'utente di richiedere manualmente lo stato attuale dall'orologio.
    if(refreshStatusBtn) {
		
		
        refreshStatusBtn.addEventListener('click', async () => {
            if (currentAppState !== APP_STATES.CONFIGURING) {
                showAlert("Attendere il completamento dell'operazione corrente.", "warning");
                return;
            }
            console.log("Refresh status button clicked");
            showButtonSpinner(refreshStatusBtn, true, "Aggiorno..."); // Mostra spinner sul pulsante di refresh

            // Tenta di derivare l'URL per lo stato dall'endpoint di configurazione
            let statusUrl = esp32ConfigEndpoint ? esp32ConfigEndpoint.replace('/config', '/status') : null;
            
            if (!statusUrl) { // Se non derivabile, chiedi all'utente
                 statusUrl = prompt("Endpoint dell'ESP32 per lo stato non noto. Inserisci l'URL completo (es. http://192.168.1.XX/status o http://materialtime.local/status):", `http://materialtime.local/status`);
            }

            if (!statusUrl) { // Se l'utente annulla
                showAlert("URL per lo stato non fornito. Aggiornamento annullato.", "warning");
                showButtonSpinner(refreshStatusBtn, false); // Ripristina pulsante
                return;
            }

            try {
                const response = await fetch(statusUrl, { signal: AbortSignal.timeout(10000) }); // Timeout 10s
                if (!response.ok) {
                    let errorDetail = "";
                    try { errorDetail = await response.text(); } catch(e){ /* ignora */ }
                    throw new Error(`Errore HTTP ${response.status}: ${response.statusText}. ${errorDetail}`);
                }
                const clockData = await response.json();
                handleClockData(clockData); // Processa i dati e aggiorna l'UI
                showAlert("Stato aggiornato con successo dall'orologio!", "success");
            } catch (error) {
                console.error("Errore durante l'aggiornamento dello stato:", error);
                showAlert(`Impossibile aggiornare lo stato: ${error.message}`, "danger");
                // In caso di errore, l'UI rimane com'era, non si puliscono i campi.
            } finally {
                showButtonSpinner(refreshStatusBtn, false); // Ripristina pulsante
            }
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





    // Azione quando l'utente conferma il reset WiFi dal modale.
    if (proceedWithWifiResetBtn) {
		
		
        proceedWithWifiResetBtn.addEventListener('click', async () => {
            if (currentAppState !== APP_STATES.CONFIRMING_WIFI_RESET) return; // Sicurezza

            setAppState(APP_STATES.SENDING_WIFI_RESET); // Imposta stato di invio reset
            showButtonSpinner(proceedWithWifiResetBtn, true, "Invio..."); // Spinner sul pulsante del modale
            // Non nascondere il modale qui, lo farà la procedura nel finally.

            // Tenta di derivare l'URL per il reset WiFi
            let targetResetUrl = null;
            if (esp32ConfigEndpoint) {
                try {
                    const baseUrl = new URL(esp32ConfigEndpoint.replace('/config', ''));
                    targetResetUrl = new URL('/reset-wifi', baseUrl).href;
                } catch (e) {
                    console.warn("Impossibile derivare l'URL di reset da esp32ConfigEndpoint:", esp32ConfigEndpoint);
                }
            }
            
            if (!targetResetUrl) { // Se non derivabile o esp32ConfigEndpoint non esiste, chiedi all'utente
                 targetResetUrl = prompt("URL dell'ESP32 per il reset WiFi non noto. Inserisci l'URL completo (es. http://192.168.1.XX/reset-wifi o http://materialtime.local/reset-wifi):", "http://materialtime.local/reset-wifi");
            }

            if (!targetResetUrl) { // Se l'utente annulla il prompt
                showAlert("URL di reset WiFi per l'ESP32 non fornito. Operazione annullata.", "warning", 10000);
                if (confirmResetWifiModal) confirmResetWifiModal.hide();
                showButtonSpinner(proceedWithWifiResetBtn, false); // Ripristina pulsante modale
                setAppState(APP_STATES.CONFIGURING); // Torna a configurazione
                return;
            }

            try {
                console.log("Invio comando reset WiFi a:", targetResetUrl);
                showAlert("Invio del comando di reset WiFi all'orologio... L'orologio si riavvierà e questa pagina potrebbe perdere la connessione.", "info", 15000);

                const response = await fetch(targetResetUrl, {
                    method: 'POST',
                    // L'ESP32 potrebbe aspettarsi un body JSON, anche se vuoto o con un semplice comando
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ command: "reset_wifi" }), 
                    signal: AbortSignal.timeout(10000) // Timeout di 10 secondi. L'ESP32 potrebbe riavviarsi prima di rispondere.
                });

                // Se l'ESP32 riesce a inviare un ACK prima di riavviarsi (non sempre garantito)
                if (response.ok) {
                    const responseBody = await response.text();
                    console.log("Risposta (probabile ACK) dall'ESP32 per il reset WiFi:", responseBody);
                } else {
                    console.warn(`L'ESP32 potrebbe non aver confermato il reset (status: ${response.status}). Questo è spesso normale.`);
                }
            } catch (error) {
                // Un errore qui è SPESSO ATTESO, specialmente un timeout o un errore di rete,
                // perché l'ESP32 si disconnette/riavvia rapidamente dopo aver ricevuto il comando.
                console.warn("Errore (spesso atteso) durante l'invio del comando di reset WiFi:", error.name, error.message);
                if (error.name === 'AbortError' || error.name === 'TypeError') { // TypeError per "failed to fetch"
                     console.log("La richiesta di reset WiFi è fallita o andata in timeout, il che è normale se l'ESP32 si è riavviato.");
                }
            } finally {
                if (confirmResetWifiModal) confirmResetWifiModal.hide(); // Nasconde il modale di conferma reset

                // Mostra un messaggio informativo importante all'utente
                showAlert(
                    "<strong>Comando di reset WiFi inviato!</strong><br>" +
                    "L'orologio dovrebbe riavviarsi in modalità Access Point (AP).<br><br>" +
                    "<strong>Azioni Richieste:</strong><br>" +
                    "1. Sul tuo smartphone/PC, cerca una rete WiFi chiamata '<strong>ClockConfig_ESP32</strong>' (o simile).<br>" +
                    "2. Connettiti a questa rete.<br>" +
                    "3. Apri il browser e naviga a <strong>192.168.4.1</strong> (o la pagina potrebbe aprirsi automaticamente).<br>" +
                    "4. Segui le istruzioni per inserire le nuove credenziali della tua rete WiFi domestica e il tuo Timezone.<br>" +
                    "5. Dopo che l'orologio si sarà connesso alla tua rete, potresti dover ricaricare questa pagina o navigare all'URL della WebApp (se lo hai configurato sull'ESP32).",
                    'success', 60000, false // Messaggio lungo, non auto-chiudibile
                );
                
                // Resetta lo stato dell'applicazione per riflettere la disconnessione
                esp32ConfigEndpoint = null; 
                lastReceivedClockStatus = null; 
                populateStatusFields(null);   // Pulisce i campi di stato
                populateFormFields(null);     // Pulisce i campi del form con i default
                
                setAppState(APP_STATES.WAITING_FOR_DATA); // Torna allo stato di attesa dati
                
                if(initialOverlayMessage) initialOverlayMessage.textContent = "Credenziali WiFi resettate. Segui le istruzioni per riconfigurare l'orologio. Ricarica la pagina quando l'orologio è di nuovo online.";
                if(initialOverlaySpinner) initialOverlaySpinner.style.display = 'none'; // Nascondi spinner, l'utente deve agire

                showButtonSpinner(proceedWithWifiResetBtn, false); // Assicura che lo spinner sul pulsante del modale sia rimosso
            }
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