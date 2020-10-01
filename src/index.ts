import { fromEvent } from "rxjs";
import { gameOn } from "./game"; // <- rxjs from NPM

const svg: SVGSVGElement = (document.getElementById(
  "board"
) as unknown) as SVGSVGElement;
const startButton: HTMLButtonElement = document.getElementById(
  "start"
) as HTMLButtonElement;

fromEvent(startButton, "click").subscribe(() => gameOn(svg));
