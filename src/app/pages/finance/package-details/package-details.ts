import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { PatientPackagesService } from '../../../core/finance/patient-packages.service';

@Component({
  selector: 'app-package-details',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './package-details.html',
  styleUrls: ['./package-details.css', '../../../shared/finance/finance-ui.scss']
})
export class PackageDetails implements OnInit {

  package:any = {};

  constructor(
    private route: ActivatedRoute,
    private patientPackagesService: PatientPackagesService
  ) {}

  ngOnInit() {

    const id =
      Number(
        this.route.snapshot.paramMap.get('id')
      );

    this.patientPackagesService
      .getPackage(id)
      .subscribe((patientPackage:any) => {
        this.package = patientPackage;
      });

  }

}
