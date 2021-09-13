import { Component, OnInit } from '@angular/core';
import { AlertCreatorService } from 'src/app/services/alert-creator/alert-creator.service';
import { LoginService } from 'src/app/services/login-service/login.service';
import jwt_decode from 'jwt-decode';
import { ModalController, ToastController } from '@ionic/angular';
import { CellQuestionPage } from './modal/cell-question/cell-question.page';
import { ClassificaPage } from '../../modal-pages/classifica/classifica.page';
import { LobbyManagerService } from 'src/app/services/lobby-manager/lobby-manager.service';
import { Router } from '@angular/router';
import { TimerServiceService } from 'src/app/services/timer-service/timer-service.service';
import { ErrorManagerService } from 'src/app/services/error-manager/error-manager.service';
import { HttpClient } from '@angular/common/http';
import { DadiPage } from 'src/app/modal-pages/dadi/dadi.page';
import { UiBuilderService } from './services/game-builder/ui-builder.service';

@Component({
  selector: 'app-goose-game',
  templateUrl: './goose-game.page.html',
  styleUrls: ['./goose-game.page.scss'],
})
export class GooseGamePage implements OnInit {
  cells = [];
  lobbyPlayers = [];
  gamePlayers = [];
  localPlayerIndex;
  myTurn = false;
  abilitaDado = false;
  info_partita = { codice: null, codice_lobby: null, giocatore_corrente: null, id_gioco: null, info: null, vincitore: null };
  lobby = { codice: null, admin_lobby: null, pubblica: false, min_giocatori: 0, max_giocatori: 0, nome: null, link: null, regolamento: null };
  fineAggiornamento = true;
  private timerGiocatori;
  private timerPing;
  private timerInfoPartita;

  constructor(
    private alertCreator: AlertCreatorService,
    private loginService: LoginService,
    private modalController: ModalController,
    private lobbyManager: LobbyManagerService,
    private timerService: TimerServiceService,
    private errorManager: ErrorManagerService,
    private toastController: ToastController,
    private router: Router,
    private http: HttpClient,
    private uiBuilder: UiBuilderService
  ) {
    this.getGameConfig();
    this.ping();
    this.loadInfoLobby()
    this.timerGiocatori = timerService.getTimer(() => { this.loadPlayers() }, 3000);
    this.timerInfoPartita = timerService.getTimer(() => { this.getInfoPartita() }, 1000);
    this.timerPing = timerService.getTimer(() => { this.ping() }, 4000);
  }

  async ngOnInit() { }

  async getGameConfig() {
    const token_value = (await this.loginService.getToken()).value;
    const headers = { 'token': token_value };

    this.http.get('/game/config', { headers }).subscribe(
      async (res) => {
        this.cells = res['results'][0].config.cells;
        this.uiBuilder.createGameBoard(this.cells);
        this.loadPlayers();
      },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'File di configurazione mancante');
      }
    );
  }

  /**
   * Carica le Informazioni della Lobby.
   */
  private async loadInfoLobby() {
    const tokenValue = (await this.loginService.getToken()).value;
    const decodedToken: any = jwt_decode(tokenValue);

    (await this.lobbyManager.loadInfoLobby()).subscribe(
      async (res) => {
        this.lobby = res['results'][0];
      },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'Impossibile caricare la lobby!');
      });
  }

  /**
   * Recupera i partecipanti della lobby.
   * La prima volta che viene fatto, vengono inizializzati i giocatori tramite il
   * metodo setGamePlayers().
   */
  async loadPlayers() {
    (await this.lobbyManager.getPartecipanti()).subscribe(
      async (res) => {
        this.lobbyPlayers = res['results'];
        if (this.gamePlayers.length == 0) this.setGamePlayers();
        if (this.gamePlayers.length > this.lobbyPlayers.length) this.rimuoviGiocatore();
      },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'Impossibile caricare i giocatori!');
      });
  }

  /**
   * Controlla se un giocatore abbandona la partita.
   * In quel caso verrà rimossa la pedina relativa al giocatore.
   */
  rimuoviGiocatore() {
    var localUsernames = this.gamePlayers.map(p => { return p.username });
    var updatedUsernames = this.lobbyPlayers.map(p => { return p.username });
    var missingPlayers = localUsernames.filter(player => !updatedUsernames.includes(player));

    missingPlayers.forEach(username => {
      this.presentToast(username + " ha abbandonato la partita.");

      this.gamePlayers.forEach(p => {
        if (p.username == username) {
          var toRemove = document.getElementById(p.goose);
          toRemove.parentNode.removeChild(toRemove);
        }
      });

      this.gamePlayers = this.gamePlayers.filter((p) => {
        return p.username !== username;
      });
    });
    this.setLocalPlayerIndex();
  }

  /**
   * Inizializza i giocatori inserendoli nell'array "gamePlayers" ed assegnando ad ognuno una pedina.
   * Viene salvato l'indice del giocatore locale nella variabile "localPlayerIndex". 
   */
  async setGamePlayers() {
    var counter = 1;
    this.lobbyPlayers.forEach(player => {
      const tmp = { 'username': player.username, 'goose': "goose" + counter, 'info': [] }
      this.gamePlayers.push(tmp);
      counter++;
    });
    this.setLocalPlayerIndex();
    this.uiBuilder.createPlayersGoose(this.gamePlayers);
    this.getInfoPartita();
  }

  /**
   * Scorre l'array 'gamePlayers' e salva l'indice della posizione del giocatore locale
   * nella variabile 'localPlayerIndex'.
   */
  async setLocalPlayerIndex() {
    const token = (await this.loginService.getToken()).value;
    const decodedToken: any = jwt_decode(token);
    this.localPlayerIndex = this.gamePlayers.map(p => p.username).indexOf(decodedToken.username);
  }

  /**
   * Recupera i dati della partita corrente //TODO
   */
  async getInfoPartita() {
    const token_value = (await this.loginService.getToken()).value;
    const headers = { 'token': token_value };

    this.http.get('/game/status', { headers }).subscribe(
      async (res) => {
        this.info_partita = res['results'][0];

        if (this.info_partita && this.info_partita.info) {
          if (this.gamePlayers.length == 1 && this.info_partita.giocatore_corrente == this.gamePlayers[this.localPlayerIndex].username && !this.myTurn)
            this.iniziaTurno();
          else await this.aggiornaMosseAvversari();

        } else if (this.info_partita.giocatore_corrente == this.gamePlayers[this.localPlayerIndex].username && !this.myTurn)
          this.iniziaTurno();
      },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'Recupero informazioni partita fallito!');
      }
    );
  }

  async aggiornaMosseAvversari() {
    var mosseAggiornate = [];

    this.info_partita.info.giocatori.forEach(p => {
      if (p.username != this.gamePlayers[this.localPlayerIndex].username) {
        mosseAggiornate = p.info_giocatore;

        this.gamePlayers.forEach(player => {
          if (player.username == p.username) {
            const differenza = mosseAggiornate.length - player.info.length;

            if (differenza > 0) {
              for (let i = (mosseAggiornate.length - differenza); i < mosseAggiornate.length; i++) {
                player.info.push(mosseAggiornate[i]);
                if (mosseAggiornate[i] != 0) {
                  this.presentToast(this.getToastMessage(player.username, mosseAggiornate[i], i));
                  this.muoviPedina(player.goose, mosseAggiornate[i]);
                }
              }
            } else {
              if (this.info_partita.giocatore_corrente == this.gamePlayers[this.localPlayerIndex].username && !this.myTurn && this.fineAggiornamento)
                this.iniziaTurno();
            }
          }
        });
        mosseAggiornate = [];
      }
    });
  }

  getToastMessage(player, lancio, nMossa) {
    //TODO
    // if (nMossa == 0)
    return player + " ha lanciato il dado ed è uscito " + lancio + "!";
    // else return player + " ha risposto correttamente alla domanda, quindi ha ritirato il dado ed è uscito " + lancio + "!";
  }

  /**
   * Mostra il toas con il messaggio passato in input
   * @param message messaggio che deve essere mostrato nel toast
   */
  async presentToast(message) {
    const toast = await this.toastController.create({
      message: message,
      position: 'top',
      cssClass: 'toast',
      duration: 3500
    });
    await toast.present();
  }

  /**
   * Recupera l'id della casella in cui si trova la pedina e ne ritorna il numero.
   * 
   * @param goose L'id della pedina di cui si vuole conoscere la posizione.
   * @returns Il numero della casella dove si trova la pedina.
   */
  getPosizionePedina(goose) {
    var cellId = document.getElementById(goose).parentElement.id;
    return parseInt(cellId.substr(1));
  }

  async ping() {
    (await this.lobbyManager.ping()).subscribe(
      async (res) => { },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'Ping fallito');
      }
    );
  }

  /**
   * Fa iniziare il turno ad un giocatore. 
   * Viene mostrato un Alert che comunica l'inizio del turno e viene abilitato il bottone per il lancio del dato.
   * Inoltre la variabile "myTurn" viene impostata a true
   */
  iniziaTurno() {
    this.alertCreator.createInfoAlert('Tocca a te!', 'È il tuo turno, tira il dado per procedere!');
    this.myTurn = true;
    this.abilitaDado = true;
  }

  private async inviaDatiPartita(info, fineTurno) {
    const tokenValue = (await this.loginService.getToken()).value;
    const toSend = { 'token': tokenValue, 'info_giocatore': info }

    this.http.put('/game/save', toSend).subscribe(
      async (res) => {
        if (fineTurno)
          this.concludiTurno();
      },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'Invio dati partita fallito');
      }
    );
  }

  async concludiTurno() {
    this.myTurn = false;
    const tokenValue = (await this.loginService.getToken()).value;
    const toSend = { 'token': tokenValue }

    this.http.put('/game/fine-turno', toSend).subscribe(
      async (res) => { },
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita, this.timerPing);
        this.router.navigateByUrl('/player/dashboard', { replaceUrl: true });
        this.errorManager.stampaErrore(res, 'Invio dati partita fallito');
      }
    );
  }

  /**
   * Dopo lo spostamento della pedina, presenta una Modal in cui sarà contenuta una domanda.
   * Se l'utente risponde correttamente alla domanda, può continuare a lanciare il dado,
   * altrimenti il turno passa al prossimo avversario. 
   * @returns presenta la Modal.
   */
  async presentaDomanda() {
    const modal = await this.modalController.create({
      component: CellQuestionPage,
      componentProps: {
        nCasella: this.cells[this.getPosizionePedina(this.gamePlayers[this.localPlayerIndex].goose)].title,
        question: this.cells[this.getPosizionePedina(this.gamePlayers[this.localPlayerIndex].goose)].question
      },
      cssClass: 'fullheight'
    });

    modal.onDidDismiss().then((data) => {
      const rispostaCorretta = data['data'];

      if (rispostaCorretta) {
        this.iniziaTurno();
      } else
        this.inviaDatiPartita(this.gamePlayers[this.localPlayerIndex].info, true);
    });
    return await modal.present();
  }

  /**
   * Salva all'interno dell'array "classifica" l'username di tutti i giocatori e la posizione della relativa pedina.
   * Il metodo ritornerà la classifica finale ordinata chiamando l'opportuno metodo.
   */
  private calcolaClassifica() {
    var classifica = [];
    var numeroCaselle = this.cells.length - 1;
    this.gamePlayers.forEach(player => {
      var posizione = 0;
      player.info.forEach(lancio => {
        posizione += lancio;

        if (posizione > numeroCaselle) {
          var dif = posizione - numeroCaselle;
          posizione = numeroCaselle - dif;
        }
      });

      var toSave = { "username": player.username, "posizione": posizione }
      classifica.push(toSave);
    });

    return this.ordinaClassifica(classifica);
  }

  /**
   * Ordina la classifica passata in input in base alla posizione delle pedine.
   * @param classifica array contenente username e posizione di tutti i giocatori della partita
   * @returns la classifica ordinata
   */
  private ordinaClassifica(classifica) {
    classifica.sort(function (a, b) {
      return b.posizione - a.posizione;
    });
    return classifica;
  }

  /**
   * Mostra la modal contenente la classifica finale
   * @returns presenta la modal
   */
  async mostraClassifica() {
    const modal = await this.modalController.create({
      component: ClassificaPage,
      componentProps: {
        classifica: this.calcolaClassifica()
      },
      cssClass: 'fullheight'
    });

    modal.onDidDismiss().then(async () => {
      this.timerService.stopTimers(this.timerPing);
      if (this.gamePlayers[this.localPlayerIndex].username == this.lobby.admin_lobby)
        this.router.navigateByUrl('/lobby-admin', { replaceUrl: true });
      else
        this.router.navigateByUrl('/lobby-guest', { replaceUrl: true });
    });

    return await modal.present();
  }

  /**
   * Controlla se esiste un giocatore con la stessa pedina passata in input.
   * Se esiste, ritorna il giocatore.
   * @param goose la pedina del giocatore
   * @returns il giocatore
   */
  private cercaGiocatoreByGoose(goose) {
    return this.gamePlayers.filter(giocatore => {
      if (giocatore.goose == goose)
        return giocatore;
    })[0];
  }

  /**
   * Fa terminare la partita e ferma gli opportuni timers.
   */
  private async terminaPartita() {
    const tokenValue = (await this.loginService.getToken()).value;
    const toSend = { 'token': tokenValue }

    this.http.put('/partita/termina', toSend).subscribe(
      async (res) => {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita);
      },
      async (res) => {
        this.errorManager.stampaErrore(res, 'Terminazione partita fallita');
      });
  }

  /**
   * Controlla se la partita è terminata oppure no.
   * Quindi controlla se la pedina passata in input si è fermata nell'ultima posizione oppure no.
   * In caso affermativo, la partita verrà terminata richiamando il metodo opportuno e verrà mostrato a video
   * un alert che comunicherà la vittoria
   * @param posizione posizione della pedina
   * @param goose la pedina
   * @returns true se la partita è terminata, false altrimenti.
   */
  private controllaFinePartita(posizione, goose) {
    if (posizione == (this.cells.length - 1)) {
      var button = [{ text: 'Vai alla classifica', handler: () => { this.mostraClassifica(); } }];

      if (goose == this.gamePlayers[this.localPlayerIndex].goose) {
        this.inviaDatiPartita(this.gamePlayers[this.localPlayerIndex].info, false);
        this.terminaPartita();
        this.alertCreator.createAlert("Vittoria", "Complimenti, hai vinto la partita!", button);
      } else {
        this.timerService.stopTimers(this.timerGiocatori, this.timerInfoPartita);
        const vincitore = this.cercaGiocatoreByGoose(goose);
        this.alertCreator.createAlert("Peccato!", vincitore.username + " ha vinto!", button);
      }

      return true;
    } else return false;
  }

  muoviPedina(goose, lancio) {
    var direzione = true;

    if (goose != this.gamePlayers[this.localPlayerIndex].goose)
      this.fineAggiornamento = false;

    const intervalloMovimentoPedina = setInterval(() => {
      var posizione = this.getPosizionePedina(goose);

      if (lancio == 0) {
        clearInterval(intervalloMovimentoPedina);
        this.fineAggiornamento = true;

        if (!this.controllaFinePartita(posizione, goose)) {
          if (goose == this.gamePlayers[this.localPlayerIndex].goose) {
            this.inviaDatiPartita(this.gamePlayers[this.localPlayerIndex].info, false);
            this.presentaDomanda();
          }

          if (this.info_partita.giocatore_corrente == this.gamePlayers[this.localPlayerIndex].username && !this.myTurn)
            this.iniziaTurno();
        }
      } else {
        if (posizione == (this.cells.length - 1)) direzione = false;

        this.effettuaSpostamento(goose, posizione, direzione);
        lancio--;
      }
    }, 600);
  }

  /**
   * Fa muovere la pedina di una casella in base alla direzione passata in input.
   * @param goose la pedina da muovere
   * @param posizione la posizione iniziale della pedina
   * @param direzione la direzione verso cui si deve muovere la pedina
   */
  effettuaSpostamento(goose, posizione, direzione) {
    if (direzione)
      document.getElementById('c' + (++posizione)).appendChild(document.getElementById(goose));
    else
      document.getElementById('c' + (--posizione)).appendChild(document.getElementById(goose));
  }

  /**
   * Apre la modal dove sarà visualizzato il lancio del dado.
   * Una volta terminata l'animazione verrà effettuato lo spostamento della pedina richiamando il metodo opportuno
   * @returns presenta la modal
   */
  async lanciaDado() {
    this.abilitaDado = false;

    const modal = await this.modalController.create({
      component: DadiPage,
      componentProps: {
        nDadi: 1
      },
      cssClass: 'die-roll-modal'
    });

    modal.onDidDismiss().then((data) => {
      const lancio = data['data'];

      if (lancio) {
        this.presentToast("Hai totalizzato " + lancio + "!")
        this.gamePlayers[this.localPlayerIndex].info.push(lancio);
        this.muoviPedina(this.gamePlayers[this.localPlayerIndex].goose, lancio);
      }
    });

    return await modal.present();
  }
}