import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EditPackage } from './edit-package';

describe('EditPackage', () => {
  let component: EditPackage;
  let fixture: ComponentFixture<EditPackage>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EditPackage],
    }).compileComponents();

    fixture = TestBed.createComponent(EditPackage);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
