import { fromEvent, Observable, Subject, timer } from "rxjs";
import {
  delay,
  filter,
  map,
  scan,
  startWith,
  takeUntil,
  takeWhile,
  withLatestFrom,
} from "rxjs/operators";

let GAME_TICK = 100; // time in milliseconds between updates
const CELL_SIZE = 16; // pixels

let currentGame: Game;

export function gameOn(svg: SVGSVGElement) {
  if (currentGame) {
    currentGame.abandon();
  } else {
    currentGame = new Game(svg, CELL_SIZE);
  }

  currentGame.gameOn();
}

type Heading = "N" | "E" | "S" | "W";

function isOpposite(heading1: Heading, heading2: Heading): boolean {
  switch (heading1) {
    case "N":
      return heading2 == "S";
    case "E":
      return heading2 == "W";
    case "S":
      return heading2 == "N";
    case "W":
      return heading2 == "E";
    default:
      return false;
  }
}

class CellLocation {
  constructor(public readonly x: number, public readonly y: number) {}

  next(heading: Heading): CellLocation {
    switch (heading) {
      case "N":
        return new CellLocation(this.x, this.y - 1);
      case "E":
        return new CellLocation(this.x + 1, this.y);
      case "S":
        return new CellLocation(this.x, this.y + 1);
      case "W":
        return new CellLocation(this.x - 1, this.y);
      default:
        return this;
    }
  }

  get id() {
    return this.x + "_" + this.y;
  }
}

class Board {
  public readonly width: number;
  public readonly height: number;

  constructor(domRect: DOMRect, public readonly cellSize: number) {
    this.width = Math.floor(domRect.width / cellSize);
    this.height = Math.floor(domRect.height / cellSize);
  }

  startSnake(size: number, heading: Heading): CellLocation[] {
    const centre = new CellLocation(
      Math.floor(this.width / 2),
      Math.floor(this.height / 2)
    );
    return [centre, centre.next(heading)];
  }

  isWithinBounds(location: CellLocation) {
    return (
      location.x >= 0 &&
      location.x < this.width &&
      location.y >= 0 &&
      location.y < this.height
    );
  }

  getRect(
    cellLocation: CellLocation
  ): { x: number; y: number; width: number; height: number } {
    return {
      x: cellLocation.x * this.cellSize,
      y: cellLocation.y * this.cellSize,
      width: this.cellSize,
      height: this.cellSize,
    };
  }

  random(): CellLocation {
    return new CellLocation(
      Math.floor(Math.random() * this.width),
      Math.floor(Math.random() * this.height)
    );
  }
}

interface GameState {
  isAlive: boolean;
  snake: {
    body: CellLocation[];
    heading: Heading;
  };
  snakeEvolution: {
    newHead: CellLocation[]; // Snake parts to be added
    oldTail: CellLocation[]; // Snake parts to be removed
  };
  foodLocation?: CellLocation;
}

class Game {
  private readonly board: Board;
  private readonly destroyed$ = new Subject();

  constructor(
    private readonly svg: SVGSVGElement,
    private readonly cellSize: number
  ) {
    this.board = new Board(svg.getBoundingClientRect(), cellSize);
  }

  gameOn() {
    const keyDowns$: Observable<KeyboardEvent> = fromEvent(
      document,
      "keydown"
    ) as Observable<KeyboardEvent>;
    const timer$ = timer(0, GAME_TICK);

    const heading$: Observable<Heading> = keyDowns$.pipe(
      filter(
        (curr: KeyboardEvent) =>
          ["ArrowUp", "ArrowRight", "ArrowDown", "ArrowLeft"].indexOf(
            curr.key
          ) !== -1
      ),
      map((curr: KeyboardEvent) => {
        switch (curr.key) {
          case "ArrowUp":
            return "N";
          case "ArrowRight":
            return "E";
          case "ArrowDown":
            return "S";
          case "ArrowLeft":
            return "W";
        }
      }),
      startWith("E")
    ) as Observable<Heading>;

    const startSnake = this.board.startSnake(2, "E");
    const state0: GameState = {
      isAlive: true,
      snake: { body: startSnake, heading: "E" },
      snakeEvolution: { newHead: startSnake, oldTail: [] },
      foodLocation: undefined,
    };
    timer$
      .pipe(
        withLatestFrom(heading$),
        scan((acc: GameState, curr: [number, Heading]) => {
          const newHeading = isOpposite(acc.snake.heading, curr[1])
            ? acc.snake.heading
            : curr[1];
          const newHead: CellLocation = acc.snake.body[
            acc.snake.body.length - 1
          ].next(newHeading);
          const didDie =
            !this.board.isWithinBounds(newHead) ||
            acc.snake.body.find((x) => x.id === newHead.id) !== undefined;
          if (didDie) {
            console.log("DEAD!", acc.snake.body.length);
            this.endGame(acc.snake.body.length);
            return { ...acc, isAlive: false };
          }

          const didEat = acc.foodLocation && acc.foodLocation.id === newHead.id;
          return {
            isAlive: true,
            snake: {
              body: didEat
                ? [...acc.snake.body, newHead]
                : [...acc.snake.body.slice(1), newHead],
              heading: newHeading,
            },
            snakeEvolution: {
              newHead: [newHead],
              oldTail: didEat ? [] : [acc.snake.body[0]],
            },
            foodLocation:
              didEat || !acc.foodLocation
                ? this.board.random()
                : acc.foodLocation,
          };
        }, state0),
        startWith(state0),
        takeWhile((gameState) => gameState.isAlive),
        takeUntil(this.destroyed$)
      )
      .subscribe((gameState: GameState) => {
        gameState.snakeEvolution.newHead.forEach((cellLocation) => {
          const rect: {
            x: number;
            y: number;
            width: number;
            height: number;
          } = this.board.getRect(cellLocation);
          const svgRect: SVGRectElement = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
          );
          svgRect.setAttribute("x", rect.x.toString());
          svgRect.setAttribute("y", rect.y.toString());
          svgRect.setAttribute("width", rect.width.toString());
          svgRect.setAttribute("height", rect.height.toString());
          svgRect.setAttribute("id", cellLocation.id);
          this.svg.appendChild(svgRect);
        });
        gameState.snakeEvolution.oldTail.forEach((cellLocation) => {
          this.svg.getElementById(cellLocation.id).remove();
        });

        const food: SVGRectElement = this.svg.getElementById(
          "food"
        ) as SVGRectElement;
        if (food) {
          if (
            !gameState.foodLocation ||
            gameState.foodLocation.id !== food.getAttribute("id")
          ) {
            food.remove();
          }
        }

        if (gameState.foodLocation) {
          this.addScore(gameState.snake.body.length);
          const rect: {
            x: number;
            y: number;
            width: number;
            height: number;
          } = this.board.getRect(gameState.foodLocation);
          const svgRect: SVGRectElement = document.createElementNS(
            "http://www.w3.org/2000/svg",
            "rect"
          );
          svgRect.setAttribute("x", rect.x.toString());
          svgRect.setAttribute("y", rect.y.toString());
          svgRect.setAttribute("width", rect.width.toString());
          svgRect.setAttribute("height", rect.height.toString());
          svgRect.setAttribute("id", "food");
          this.svg.appendChild(svgRect);
        }
      });
  }

  abandon() {
    this.destroyed$.next();
    while (this.svg.childNodes.length > 0) {
      this.svg.childNodes[0].remove();
    }
  }

  addScore(score: number) {
    const scoreP: HTMLParagraphElement = document.getElementById(
      "score"
    ) as HTMLParagraphElement;
    scoreP.textContent = `score: ${score}`;
  }

  formSubmition(event: any, score: number) {
    event.preventDefault();
    const name = event.target.querySelector(".name").value;
    if (name == "") return;
    const scoreString = score.toString();
    localStorage.setItem(name, scoreString);
    //event.target.reset();

    const endDiv = document.getElementById("endGame");
    endDiv.style.display = "none";

    this.CreateScoreBoard();
  }

  endGame(score: number) {
    const endDiv = document.getElementById("endGame");
    endDiv.style.display = "block";
    //adding the score
    const scoreSpan: HTMLSpanElement = document.getElementById(
      "endScore"
    ) as HTMLSpanElement;
    scoreSpan.textContent = ` ${score}`;
    //console.log(score);
    //handling the form
    const form = document.getElementById("form");
    form.addEventListener("submit", (e) => {
      this.formSubmition(e, score);
    });

    //reset the input
    const inputName: HTMLInputElement = document.getElementById(
      "nameInput"
    ) as HTMLInputElement;
    inputName.value = "";
  }

  CreateScoreBoard() {
    const myStorage = Object.entries(localStorage);
    myStorage.sort((a: any, b: any) => {
      return b[1] - a[1];
    });

    console.table(myStorage);

    let ol = document.getElementById("lead");

    //empty the list
    let list = ol.getElementsByTagName("li");
    Array.from(list).forEach((item) => ol.removeChild(item));

    //populate the list
    myStorage.map((person) => {
      let li = document.createElement("li");
      li.appendChild(document.createTextNode(`${person[0]} : ${person[1]}`));
      ol.appendChild(li);
    });
  }
}
