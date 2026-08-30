import { AfterViewInit, Component, ElementRef, ViewChild } from '@angular/core';

@Component({
  imports: [],
  selector: 'app-animate',
  styleUrl: './animate.scss',
  templateUrl: './animate.html',
})
export class Animate implements AfterViewInit {
  @ViewChild('khWord') khWord!: ElementRef<HTMLElement>;
  @ViewChild('moWord') moWord!: ElementRef<HTMLElement>;
  @ViewChild('resultSlot') resultSlot!: ElementRef<HTMLElement>;

  private readonly khFull = 'ខ្មែរ';
  private readonly moFull = 'មន';
  private readonly khHighlightEnd = 3; // ខ + coeng + ម — the whole subscript-stack cluster
  private readonly moHighlightEnd = 1; // ម alone
  private readonly typeSpeed = 180; // ms per character

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const root = this.host.nativeElement.querySelector<HTMLElement>('.equation');
    if (!root) return;

    // Defensive cleanup: with Angular's dev-mode HMR, this component can
    // re-run without a full page reload. Our overlays/clones live on
    // document.body (outside Angular's view tree), so a stale run's
    // elements would otherwise never get removed and pile up over time.
    document.querySelectorAll('.equation-flyer, .equation-spark, .equation-debug-marker').forEach((el) => el.remove());

    document.fonts.ready.then(() => {
      requestAnimationFrame(() => this.play(root));
    });
  }

  private async play(root: HTMLElement): Promise<void> {
    const styles = getComputedStyle(root);
    const finalColor = styles.getPropertyValue('--equation-final-color').trim() || '#b8860b';
    const flightDuration =
      parseFloat(styles.getPropertyValue('--equation-flight-duration')) * 1000 || 2500;
    const flightEase = styles.getPropertyValue('--equation-flight-ease').trim() || 'ease';
    const arcHeight = parseFloat(styles.getPropertyValue('--equation-arc-height')) || 90;

    const khEl = this.khWord.nativeElement;
    const moEl = this.moWord.nativeElement;

    // Type both words fully first — WITHOUT placing any overlay yet. The
    // words finish at different times (moFull is much shorter than
    // khFull), and this centered flex row keeps reflowing as long as
    // either word is still growing. Measuring an overlay's position before
    // BOTH words are completely done would snapshot a not-yet-final
    // layout, leaving it stranded once the row settles.
    const [khTextNode, moTextNode] = await Promise.all([
      this.typeWord(khEl, this.khFull, this.typeSpeed),
      this.typeWord(moEl, this.moFull, this.typeSpeed),
    ]);

    // One more frame to be certain layout has fully flushed after the very
    // last character was appended.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    const khOverlay = this.createPersistentOverlay(khTextNode, this.khHighlightEnd, finalColor);
    const moOverlay = this.createPersistentOverlay(moTextNode, this.moHighlightEnd, finalColor);

    await new Promise((resolve) => setTimeout(resolve, 600)); // brief pause once typed

    // Fly CLONES of the overlays to the result — the originals stay put,
    // so the words never lose their color.
    await Promise.all([
      this.flyOverlayClone(khOverlay, this.resultSlot.nativeElement, -arcHeight, flightDuration, flightEase),
      this.flyOverlayClone(moOverlay, this.resultSlot.nativeElement, arcHeight, flightDuration, flightEase),
    ]);

    root.classList.add('is-combined');
    this.spawnSparkles(this.resultSlot.nativeElement, finalColor);
  }

  /**
   * Types `full` into `el` one character at a time by appending to a single
   * Text node (never replacing/recreating it), so Khmer shaping — e.g. the
   * ខ + coeng + ម subscript stack — stays correct at every step. Resolves
   * with that Text node once typing is complete. Does NOT place any
   * overlay itself — see play() for why that's deferred.
   */
  private typeWord(el: HTMLElement, full: string, typeSpeed: number): Promise<Text> {
    return new Promise((resolve) => {
      const textNode = document.createTextNode('');
      el.appendChild(textNode);

      let i = 0;
      const tick = () => {
        textNode.appendData(full[i]);
        i++;

        if (i < full.length) {
          setTimeout(tick, typeSpeed);
        } else {
          resolve(textNode);
        }
      };
      setTimeout(tick, typeSpeed);
    });
  }

  /**
   * Measures the on-screen position of textNode[0..end) ONCE (a plain,
   * one-time snapshot — not something the DOM keeps "live"), then places a
   * separate, permanently-colored span exactly on top of it. The real text
   * underneath stays black and untouched; this overlay is purely visual.
   */
  private createPersistentOverlay(textNode: Text, end: number, color: string): HTMLElement {
    const range = document.createRange();
    range.setStart(textNode, 0);
    range.setEnd(textNode, end);
    const rect =
      (range.getClientRects()[0] as DOMRect) ??
      (textNode.parentElement as HTMLElement).getBoundingClientRect();

    const parentEl = textNode.parentElement as HTMLElement;
    const overlay = document.createElement('span');
    overlay.className = 'equation-flyer';
    overlay.textContent = textNode.data.slice(0, end);
    overlay.style.fontSize = getComputedStyle(parentEl).fontSize;
    overlay.style.color = color;
    overlay.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    document.body.appendChild(overlay);
    return overlay;
  }

  /**
   * Clones the persistent overlay and arcs the CLONE toward the result
   * slot, leaving the original overlay untouched and in place — so the
   * word's coloring never disappears once the "letter" departs.
   */
  private async flyOverlayClone(
    sourceOverlay: HTMLElement,
    target: HTMLElement,
    arcOffset: number,
    duration: number,
    ease: string
  ): Promise<void> {
    const rect = sourceOverlay.getBoundingClientRect();
    const t = target.getBoundingClientRect();
    // eslint-disable-next-line no-console
    console.log(
      '[animate]', sourceOverlay.textContent,
      'source:', rect.left.toFixed(0), rect.top.toFixed(0), rect.width.toFixed(0), rect.height.toFixed(0),
      'target:', t.left.toFixed(0), t.top.toFixed(0), t.width.toFixed(0), t.height.toFixed(0)
    );
    this.dropDebugMarker(rect.left + rect.width / 2, rect.top + rect.height / 2, 'blue');
    this.dropDebugMarker(t.left + t.width / 2, t.top + t.height / 2, 'red');

    const clone = sourceOverlay.cloneNode(true) as HTMLElement;
    clone.style.transform = `translate(${rect.left}px, ${rect.top}px)`;
    document.body.appendChild(clone);

    const sx = rect.left + rect.width / 2;
    const sy = rect.top + rect.height / 2;
    const tx = t.left + t.width / 2;
    const ty = t.top + t.height / 2;
    const cx = (sx + tx) / 2;
    const cy = (sy + ty) / 2 + arcOffset;

    const steps = 8;
    const keyframes: Keyframe[] = [];
    for (let i = 0; i <= steps; i++) {
      const p = i / steps;
      const x = (1 - p) ** 2 * sx + 2 * (1 - p) * p * cx + p ** 2 * tx;
      const y = (1 - p) ** 2 * sy + 2 * (1 - p) * p * cy + p ** 2 * ty;
      const scale = 1 - 0.25 * p;
      const opacity = p < 0.85 ? 1 : 1 - (p - 0.85) / 0.15;
      keyframes.push({
        transform: `translate(${x - rect.width / 2}px, ${y - rect.height / 2}px) scale(${scale})`,
        opacity,
      });
    }

    await clone.animate(keyframes, { duration, easing: ease, fill: 'forwards' }).finished;
    clone.remove();
  }

  /** TEMPORARY DEBUG HELPER: drops a small fixed, colored dot at the given
   * viewport coordinates, so we can SEE where the code thinks a rect is,
   * directly on the page — no DevTools object-expansion needed. Remove
   * once positioning is confirmed correct. */
  private dropDebugMarker(x: number, y: number, color: string): void {
    const dot = document.createElement('div');
    dot.style.position = 'fixed';
    dot.style.left = '0';
    dot.style.top = '0';
    dot.style.width = '12px';
    dot.style.height = '12px';
    dot.style.borderRadius = '50%';
    dot.style.background = color;
    dot.style.border = '2px solid white';
    dot.style.zIndex = '9999';
    dot.style.pointerEvents = 'none';
    dot.style.transform = `translate(${x - 6}px, ${y - 6}px)`;
    dot.className = 'equation-debug-marker';
    document.body.appendChild(dot);
  }

  private spawnSparkles(target: HTMLElement, color: string): void {
    const rect = target.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const count = 10;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const radius = 30 + Math.random() * 30;
      const dx = Math.cos(angle) * radius;
      const dy = Math.sin(angle) * radius;

      const spark = document.createElement('span');
      spark.className = 'equation-spark';
      spark.style.background = `radial-gradient(circle, #fff8dc 0%, ${color} 55%, transparent 75%)`;
      document.body.appendChild(spark);

      const duration = 600 + Math.random() * 400;
      const anim = spark.animate(
        [
          { transform: `translate(${cx}px, ${cy}px) scale(0)`, opacity: 0 },
          { transform: `translate(${cx}px, ${cy}px) scale(1)`, opacity: 1, offset: 0.2 },
          { transform: `translate(${cx + dx}px, ${cy + dy}px) scale(0.2)`, opacity: 0 },
        ],
        { duration, easing: 'ease-out', fill: 'forwards' }
      );
      anim.finished.then(() => spark.remove()).catch(() => spark.remove());
    }
  }
}
