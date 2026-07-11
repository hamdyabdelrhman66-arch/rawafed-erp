import { ComponentFixture, TestBed } from '@angular/core/testing';

import { InvoiceTemplate } from './invoice-template';

describe('InvoiceTemplate', () => {
  let component: InvoiceTemplate;
  let fixture: ComponentFixture<InvoiceTemplate>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [InvoiceTemplate],
    }).compileComponents();

    fixture = TestBed.createComponent(InvoiceTemplate);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
