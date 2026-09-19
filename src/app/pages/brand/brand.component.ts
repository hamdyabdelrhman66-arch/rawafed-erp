import { CommonModule,DOCUMENT } from '@angular/common';
import { Component,HostListener,inject,signal } from '@angular/core';
import { FormBuilder,ReactiveFormsModule,Validators } from '@angular/forms';
@Component({selector:'app-brand',standalone:true,imports:[CommonModule,ReactiveFormsModule],templateUrl:'./brand.component.html',styleUrl:'./brand.component.scss'})
export class BrandComponent {
 private readonly doc=inject(DOCUMENT); private readonly fb=inject(FormBuilder); language=signal<'en'|'ar'>('en'); menu=signal(false); scrolled=signal(false); submitted=signal(false);
 credentials=[['Q','Certified QBA','Qualified Behavior Analyst'],['◎','QABA Board','International standards'],['✦','Professional Trainer','Practice-led education'],['∞','Special Needs','Specialist education']];
 programs=[['01','QABA Pathway','ABAT Preparation','Build confident foundations in applied behavior analysis with exam-focused instruction.','40 training hours'],['02','Advanced Practice','QASP-S Preparation','Advance your supervised practice, clinical judgment and professional readiness.','60 training hours'],['03','Professional','QBA Preparation','A rigorous pathway for experienced practitioners preparing for QBA certification.','90 training hours']];
 courses=[['ABAT Exam Preparation','ABA Certification','12 Oct 2026','Online · 8 weeks'],['Early Intervention Practitioner','Special Needs','03 Nov 2026','Hybrid · 10 weeks'],['Sensory Integration Fundamentals','Occupational Therapy','18 Nov 2026','Online · 4 weeks']];
 registration=this.fb.nonNullable.group({name:['',Validators.required],email:['',[Validators.required,Validators.email]],phone:['',Validators.required],country:[''],profession:[''],program:['ABAT Preparation'],delivery:['Online'],notes:[''],terms:[false,Validators.requiredTrue]});
 contact=this.fb.nonNullable.group({name:['',Validators.required],email:['',[Validators.required,Validators.email]],phone:[''],subject:[''],message:['',Validators.required]});
 @HostListener('window:scroll') scroll(){this.scrolled.set(window.scrollY>24)}
 toggleLanguage(){const n=this.language()==='en'?'ar':'en';this.language.set(n);this.doc.documentElement.lang=n;this.doc.documentElement.dir=n==='ar'?'rtl':'ltr'}
 submit(){if(this.registration.valid){this.submitted.set(true);this.registration.reset({program:'ABAT Preparation',delivery:'Online',terms:false})}else this.registration.markAllAsTouched()}
}
