import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ExpenseDetails } from './expense-details';

describe('ExpenseDetails', () => {
  let component: ExpenseDetails;
  let fixture: ComponentFixture<ExpenseDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExpenseDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(ExpenseDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
