import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditExpense } from './edit-expense';

describe('EditExpense', () => {
  let component: EditExpense;
  let fixture: ComponentFixture<EditExpense>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditExpense],
    }).compileComponents();

    fixture = TestBed.createComponent(EditExpense);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
