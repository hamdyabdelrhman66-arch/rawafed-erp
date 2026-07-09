import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PatientPackages } from './patient-packages';

describe('PatientPackages', () => {
  let component: PatientPackages;
  let fixture: ComponentFixture<PatientPackages>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PatientPackages],
    }).compileComponents();

    fixture = TestBed.createComponent(PatientPackages);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
