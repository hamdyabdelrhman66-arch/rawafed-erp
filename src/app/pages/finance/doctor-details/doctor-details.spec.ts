import { ComponentFixture, TestBed } from '@angular/core/testing';

import { DoctorDetails } from './doctor-details';

describe('DoctorDetails', () => {
  let component: DoctorDetails;
  let fixture: ComponentFixture<DoctorDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [DoctorDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(DoctorDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
