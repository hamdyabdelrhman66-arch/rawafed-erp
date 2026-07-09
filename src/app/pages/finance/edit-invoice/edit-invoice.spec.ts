import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditInvoice } from './edit-invoice';

describe('EditInvoice', () => {
  let component: EditInvoice;
  let fixture: ComponentFixture<EditInvoice>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditInvoice],
    }).compileComponents();

    fixture = TestBed.createComponent(EditInvoice);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
