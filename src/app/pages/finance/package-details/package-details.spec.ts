import { ComponentFixture, TestBed } from '@angular/core/testing';

import { PackageDetails } from './package-details';

describe('PackageDetails', () => {
  let component: PackageDetails;
  let fixture: ComponentFixture<PackageDetails>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PackageDetails],
    }).compileComponents();

    fixture = TestBed.createComponent(PackageDetails);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
