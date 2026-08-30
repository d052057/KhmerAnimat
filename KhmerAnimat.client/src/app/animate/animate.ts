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
  private readonly typeSpeed = 180; // ms per character

  constructor(private host: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    const root = this.host.nativeElement.querySelector<HTMLElement>('.equation');
    if (!root) return;

    // Defensive cleanup: with Angular's dev-mode HMR, this component can
    // re-run without a full page reload. Our overlays/clones live on
    // document.body (outside Angular's view tree), so a stale run's
    // elements would otherwise never get removed and pile up over time.
    document.querySelectorAll('.equation-flyer, .equation-spark').forEach((el) => el.remove());

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

    // Type both words fully first. They finish at different times (moFull
    // is much shorter than khFull), and this centered flex row keeps
    // reflowing as long as either word is still growing, so we don't
    // touch overlay placement until both are completely done.
    await Promise.all([
      this.typeWord(khEl, this.khFull, this.typeSpeed),
      this.typeWord(moEl, this.moFull, this.typeSpeed),
    ]);

    // One more frame to be certain layout has fully flushed after the very
    // last character was appended.
    await new Promise((resolve) => requestAnimationFrame(resolve));

    // ខ្មែរ renders as: ែ (reordered in front) + ខ្ម (base+subscript) + រ.
    // 'ខ្មែ' = target cluster + the vowel that visually jumps before it —
    // measuring that alongside the bare target cluster lets us work out
    // exactly how much space the reordering vowel occupies.
    const khOverlay = this.createPersistentOverlay(khEl, 'ខ្ម', 'ខ្មែ', finalColor);
    // មន has no reordering vowel — ម simply starts at the word's own edge.
    const moOverlay = this.createPersistentOverlay(moEl, 'ម', 'ម', finalColor);

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
   * ខ + coeng + ម subscript stack — stays correct at every step.
   */
  private typeWord(el: HTMLElement, full: string, typeSpeed: number): Promise<void> {
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
          resolve();
        }
      };
      setTimeout(tick, typeSpeed);
    });
  }

  /**
   * getBoundingClientRect() is always VIEWPORT-relative (changes with
   * scroll position). Our overlays use `position: absolute`, which is
   * DOCUMENT-relative. This converts one to the other at the moment of
   * measurement.
   */
  private toDocumentRect(rect: DOMRect): { left: number; top: number; width: number; height: number } {
    return {
      left: rect.left + window.scrollX,
      top: rect.top + window.scrollY,
      width: rect.width,
      height: rect.height,
    };
  }

  /**
   * Measures the rendered width of `text` in isolation, in the same font
   * as `referenceEl`, using a temporary off-screen element's OWN
   * getBoundingClientRect() — never a Range. Whole-element rects have
   * proven reliable in this app; Range.getClientRects() on a sub-portion
   * of live text has not, so we avoid it entirely.
   */
  private measureIsolatedWidth(text: string, referenceEl: HTMLElement): number {
    const probe = document.createElement('span');
    probe.textContent = text;
    probe.style.position = 'absolute';
    probe.style.visibility = 'hidden';
    probe.style.whiteSpace = 'nowrap';
    probe.style.left = '-9999px';
    probe.style.top = '0';
    probe.style.fontFamily = getComputedStyle(referenceEl).fontFamily;
    probe.style.fontSize = getComputedStyle(referenceEl).fontSize;
    document.body.appendChild(probe);
    const width = probe.getBoundingClientRect().width;
    probe.remove();
    return width;
  }

  /**
   * Places a PERMANENT colored overlay over `targetSubstring` as it
   * appears at the very start of `wordEl`'s text. `reorderingContext`
   * should be `targetSubstring` plus any immediately-following character
   * that visually reorders in FRONT of it (e.g. a Khmer pre-base vowel);
   * pass just `targetSubstring` again if there's no such character. The
   * offset is derived purely from isolated whole-element width
   * measurements — no Range is used anywhere in this calculation.
   */
  private createPersistentOverlay(
    wordEl: HTMLElement,
    targetSubstring: string,
    reorderingContext: string,
    color: string
  ): HTMLElement {
    const wordRect = this.toDocumentRect(wordEl.getBoundingClientRect());
    const targetWidth = this.measureIsolatedWidth(targetSubstring, wordEl);
    const contextWidth = this.measureIsolatedWidth(reorderingContext, wordEl);
    const offset = Math.max(0, contextWidth - targetWidth);

    const overlay = document.createElement('span');
    overlay.className = 'equation-flyer';
    overlay.textContent = targetSubstring;
    overlay.style.fontSize = getComputedStyle(wordEl).fontSize;
    overlay.style.color = color;
    overlay.style.transform = `translate(${wordRect.left + offset}px, ${wordRect.top}px)`;
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
    const rect = this.toDocumentRect(sourceOverlay.getBoundingClientRect());
    const t = this.toDocumentRect(target.getBoundingClientRect());

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

  private spawnSparkles(target: HTMLElement, color: string): void {
    const rect = this.toDocumentRect(target.getBoundingClientRect());
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
