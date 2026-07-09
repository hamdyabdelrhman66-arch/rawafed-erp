import { AfterViewInit, Component, ElementRef, EventEmitter, Input, OnDestroy, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import SignaturePad from 'signature_pad';

@Component({
  selector: 'raw-signature-pad',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './signature-pad.component.html',
  styleUrls: ['./signature-pad.component.scss']})
export class SignaturePadComponent implements AfterViewInit, OnDestroy {
  @Input({ required: true }) label = '';
  @Input() value = '';
  @Output() valueChange = new EventEmitter<string>();
  @ViewChild('canvas', { static: true }) canvasRef!: ElementRef<HTMLCanvasElement>;

  private pad?: SignaturePad;
  private redoStack: ReturnType<SignaturePad['toData']> = [];
  private readonly resize = () => this.resizeCanvas();
  canUndo = false;
  canRedo = false;

  ngAfterViewInit(): void {
    this.pad = new SignaturePad(this.canvasRef.nativeElement, {
      backgroundColor: 'rgb(255,255,255)',
      penColor: '#172033',
      minWidth: 0.85,
      maxWidth: 3.6,
      velocityFilterWeight: 0.55,
      throttle: 8,
      minDistance: 1
    });
    this.resizeCanvas();
    this.pad.addEventListener('beginStroke', () => {
      this.redoStack = [];
      this.updateHistoryState();
    });
    this.pad.addEventListener('endStroke', () => this.emitValue());
    if (this.value) this.pad.fromDataURL(this.value).then(() => this.updateHistoryState());
    window.addEventListener('resize', this.resize);
  }

  ngOnDestroy(): void {
    window.removeEventListener('resize', this.resize);
  }

  clear(): void {
    this.pad?.clear();
    this.redoStack = [];
    this.updateHistoryState();
    this.valueChange.emit('');
  }

  undo(): void {
    if (!this.pad) return;
    const data = this.pad.toData();
    const stroke = data.pop();
    if (!stroke) return;
    this.redoStack.push(stroke);
    this.pad.fromData(data);
    this.emitValue();
  }

  redo(): void {
    if (!this.pad) return;
    const stroke = this.redoStack.pop();
    if (!stroke) return;
    this.pad.fromData([...this.pad.toData(), stroke]);
    this.emitValue();
  }

  private resizeCanvas(): void {
    const canvas = this.canvasRef.nativeElement;
    const ratio = Math.max(window.devicePixelRatio || 1, 1);
    const rect = canvas.getBoundingClientRect();
    const data = this.pad?.toData() || [];
    canvas.width = rect.width * ratio;
    canvas.height = rect.height * ratio;
    canvas.getContext('2d')?.scale(ratio, ratio);
    if (this.pad && data.length) this.pad.fromData(data);
    if (this.value && this.pad && !data.length) this.pad.fromDataURL(this.value).then(() => this.updateHistoryState());
  }

  private emitValue(): void {
    this.updateHistoryState();
    this.valueChange.emit(this.pad?.isEmpty() ? '' : this.pad?.toDataURL('image/png') || '');
  }

  private updateHistoryState(): void {
    this.canUndo = Boolean(this.pad?.toData().length);
    this.canRedo = this.redoStack.length > 0;
  }
}
