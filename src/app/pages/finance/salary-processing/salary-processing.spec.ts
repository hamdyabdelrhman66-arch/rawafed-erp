import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { SalaryProcessing } from './salary-processing';

describe('SalaryProcessing', () => {
  let component: SalaryProcessing;
  let fixture: ComponentFixture<SalaryProcessing>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SalaryProcessing, FormsModule],
    }).compileComponents();

    fixture = TestBed.createComponent(SalaryProcessing);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
