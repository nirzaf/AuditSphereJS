import { bootstrapApplication } from '@angular/platform-browser';
import { Component, provideAppInitializer } from '@angular/core';
import { RouterOutlet, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { prepareIdentityRedirect } from './identity';
@Component({ selector: 'audit-root', imports: [RouterOutlet], template: '<router-outlet />' })
class Application {}
bootstrapApplication(Application, { providers: [provideHttpClient(), provideAppInitializer(prepareIdentityRedirect), provideRouter([
  { path: '', loadComponent: () => import('./workspace').then(module => module.Workspace) },
  { path: 'portal', loadComponent: () => import('./portal').then(module => module.Portal) },
  { path: '**', redirectTo: '' },
])] }).catch(console.error);
