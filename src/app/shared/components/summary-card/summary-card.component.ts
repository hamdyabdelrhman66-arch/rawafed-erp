import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'raw-summary-card',
  standalone: true,
  imports: [CommonModule, MatButtonModule, MatIconModule],
  templateUrl: './summary-card.component.html',
  styleUrls: ['./summary-card.component.scss']})
export class SummaryCardComponent {
  @Input({ required: true }) title = '';
  @Input({ required: true }) rows: [string, string][] = [];
  @Input() editable = false;
}
