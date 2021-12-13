import { Component, OnDestroy, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { AlertCreatorService } from 'src/app/services/alert-creator/alert-creator.service';
import { TimerController } from 'src/app/services/timer-controller/timer-controller.service';
import { GameLogicService } from '../services/game-logic/game-logic.service';
import { MemoryCard } from '../components/memory-card';
import { MemoryPlayer } from '../components/memory-player';
import { CardQuestionPage } from '../modal-page/card-question/card-question.page';
import { ModalController } from '@ionic/angular';
import { MemoryDataKeeperService } from '../services/data-keeper/data-keeper.service';

@Component({
  selector: 'app-game',
  templateUrl: './game.page.html',
  styleUrls: ['./game.page.scss'],
})
export class GamePage implements OnInit, OnDestroy {
  selectedCards: MemoryCard[] = [];
  players: MemoryPlayer[] = [];
  carteScoperte = 0;

  timeMode = false;
  interval;
  minutes;
  seconds;

  constructor(
    private gameLogic: GameLogicService,
    private router: Router,
    private alertCreator: AlertCreatorService,
    private timerService: TimerController,
    private modalController: ModalController,
    private dataKeeper: MemoryDataKeeperService,
    private alertController: AlertCreatorService
  ) { }

  ngOnInit() {
    this.gameLogic.initialization();

    if (this.dataKeeper.getGameMode() == "tempo")
      this.setTimer();
  }

  /**
   * Imposta la variabile 'timeMode' a true e inizializza 'minutes' e 'seconds' in base al loro valore iniziale.
   */
  private setTimer() {
    this.timeMode = true;
    this.minutes = this.dataKeeper.getGameTime().minutes;
    this.seconds = this.dataKeeper.getGameTime().seconds;
    this.startTimer();
  }

  /**
   * Fa partire il countdown per la partita.
   */
  private startTimer() {
    this.interval = setInterval(() => {
      if (this.seconds == 0) {
        this.minutes -= 1;
        this.seconds = 59;
      }
      this.seconds -= 1;
      if (this.seconds == 0 && this.minutes == 0)
        this.terminaPartita();

    }, 1000);
  }

  ngOnDestroy() {
    this.gameLogic.stopTimers();
  }

  /**
   * Ritorna le carte da gioco prendendole dal service 'gameLogic'.
   * @returns le carte da gioco
   */
  getCards() {
    return this.gameLogic.getCards();
  }

  /**
   * richiama il metodo per terminare il turno del giocatore corrente dal service 'gameLogic'.
   * Dopodichè viene mostrato l'alert informando l'utente del cambio turno.
   */
  endTurn() {
    this.gameLogic.endCurrentPlayerTurn();
    this.alertController.createInfoAlert("FINE TURNO", "Ora è il turno di " + this.gameLogic.getCurrentPlayer().nickname);
  }

  /**
   * Metodo richiamato ogni volta che l'utente preme su una carta.
   * Quest'ultima verrà girata se 'flippableCards' è true e se la carta non è già girata.
   * @param card 
   */
  selectCard(card: MemoryCard) {
    if (card.enabled && this.gameLogic.flippableCards && !this.selectedCards.includes(card)) {

      if (this.selectedCards.length < 2) {
        card.memory_card.revealCard();
        this.selectedCards.push(card);
      }

      if (this.selectedCards.length == 2) {
        this.gameLogic.flippableCards = false;

        setTimeout(() => {
          this.compareCards();
        }, 1000);
      }
    }
  }

  /**
   * Confronta le due carte selezionate dall'utente.
   * Se le carte sono uguali verrà presentata la domanda relativa alla carta, altrimenti le carte verranno coperte.
   */
  compareCards() {
    if (this.selectedCards[0].title == this.selectedCards[1].title) {
      this.selectedCards[0].enabled = false;
      this.selectedCards[1].enabled = false;
      this.presentaDomanda(this.selectedCards[0]);
    }
    else {
      this.selectedCards[0].enabled = true;
      this.selectedCards[1].enabled = true;

      this.selectedCards[0].memory_card.coverCard();
      this.selectedCards[1].memory_card.coverCard();

      this.endTurn();
      this.selectedCards = [];
      this.gameLogic.flippableCards = true;
    }
  }

  /**
   * Restituisce l'usetrname del giocatore che ha vinto la partita
   * @returns 
   */
  private getWinner() {
    return this.gameLogic.players.reduce((a: MemoryPlayer, b: MemoryPlayer) => {
      if (a.guessedCards.length > b.guessedCards.length) {
        return a;
      } else return b;
    }).nickname;
  }

  /**
   * Presenta la modal della domanda relativa ad una carta.
   * Se l'utente risponde correttamente alla domanda, esso riceverà un punto e verrà richiamato il metodo per controllare se la partita è finita e,
   * in caso negativo, il turno rimane al giocatore.
   * Altrimenti il giocatore non riceve nessun punto, le carte verrano coperte ed il turno verrà passato al prossimo giocatore.
   * @param card carta da cui viene presa la domanda
   */
  private async presentaDomanda(card: MemoryCard) {
    const modal = await this.modalController.create({
      component: CardQuestionPage,
      componentProps: {
        card: card
      },
      cssClass: 'fullscreen'
    });

    modal.onDidDismiss().then((data) => {
      const rispostaCorretta = data['data'];

      if (rispostaCorretta) {
        this.carteScoperte += 1;
        this.gameLogic.getCurrentPlayer().guessedCards.push(this.selectedCards[0]);
        this.controllaVittoria();
      }
      else {
        this.coverSelectedCards();
        this.endTurn();
      }
      this.selectedCards = [];
      this.gameLogic.flippableCards = true;
    });

    await modal.present();
  }

  /**
   * Copre le carte selezionate
   */
  private coverSelectedCards() {
    this.selectedCards[0].enabled = true;
    this.selectedCards[1].enabled = true;

    this.selectedCards[0].memory_card.coverCard();
    this.selectedCards[1].memory_card.coverCard();
  }

  /**
   * Controlla se la partita è terminata oppure no. In caso positivo richiama il metodo opportuno.
   */
  controllaVittoria() {
    if (this.carteScoperte == this.gameLogic.cards.length)
      this.terminaPartita();
  }

  /**
   * Effettua la chiamata REST per terminare la partita
   */
  private terminaPartita() {
    var button = [{
      text: 'TORNA AL MENU', handler: () => {
        this.gameLogic.stopTimers();
        this.router.navigateByUrl('/memory', { replaceUrl: true });
      }
    }];
    this.alertCreator.createAlert("PARTITA TERMINATA", "Il giocatore " + this.getWinner() + " ha vinto la partita", button);
    this.dataKeeper.getPlayers().forEach(player => {
      player.guessedCards = [];
    });
    if (this.timeMode) clearInterval(this.interval);
  }

}