import { bootstrapApplication } from '@angular/platform-browser';
import { Component } from '@angular/core';
import { RouterOutlet, provideRouter } from '@angular/router';
@Component({ selector: 'audit-root', imports: [RouterOutlet], template: '<router-outlet />' })
class Application {}
bootstrapApplication(Application, { providers: [provideRouter([
  { path: '', loadComponent: () => import('./workspace').then(module => module.Workspace) },
  { path: 'portal', loadComponent: () => import('./portal').then(module => module.Portal) },
  { path: '**', redirectTo: '' },
])] }).catch(console.error);
