// Keyboard and mouse state for Port Meridian, with edge-triggered "pressed" queries.

export class Input {
  constructor(canvas) {
    this.keys = new Set();
    this.pressedSet = new Set();
    this.mouseX = 0;
    this.mouseY = 0;
    this.mouseDown = false;
    this.mouseClicked = false;
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(code)) e.preventDefault();
      if (!this.keys.has(code)) this.pressedSet.add(code);
      this.keys.add(code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => {
      this.keys.clear();
      this.mouseDown = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
    });
    canvas.addEventListener('mousedown', (e) => {
      if (e.button === 0) {
        this.mouseDown = true;
        this.mouseClicked = true;
      }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDown = false;
    });
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  pressed(...codes) {
    return codes.some((c) => this.pressedSet.has(c));
  }

  endFrame() {
    this.pressedSet.clear();
    this.mouseClicked = false;
  }
}
