import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PatientDetails } from './patient-details';

describe('PatientDetails', () => {
  let component: PatientDetails;
  let fixture: ComponentFixture<PatientDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
