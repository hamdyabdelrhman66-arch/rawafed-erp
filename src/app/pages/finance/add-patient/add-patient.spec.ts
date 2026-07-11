import { ComponentFixture, TestBed } from '@angular/core/testing';

import { AddPatient } from './add-patient';

describe('AddPatient', () => {
  let component: AddPatient;
  let fixture: ComponentFixture<AddPatient>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AddPatient],
    }).compileComponents();

    fixture = TestBed.createComponent(AddPatient);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
