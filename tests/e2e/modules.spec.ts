import { test, expect } from '@playwright/test';
import { moduleScreens } from '../../apps/web/src/module-catalog.js';
test('every module workspace renders with clear authority boundaries and mobile containment', async ({page}) => {
  test.setTimeout(60_000);
  await page.route('**/api/v1/identity/config', route => route.fulfill({json:{provider:'development'}}));
  for (const screen of moduleScreens) {
    await page.goto(`/?module=${screen.module}&view=${screen.id}`);
    await expect(page.getByRole('heading',{name:screen.id==='ledger'?'Practice ledger':screen.id==='trial-balance'?'Trial Balance workspace':screen.title,exact:true})).toBeVisible();
    if (!screen.endpoint && screen.id!=='ledger' && screen.id!=='trial-balance') await expect(page.getByText('Preparation only',{exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),screen.id).toBe(true);
  }
});
test('session drafts survive module navigation and browser history preserves the workspace', async ({page}) => {
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  await page.goto('/?module=Commercial&view=leads');
  await page.getByLabel('Legal entity name').fill('Synthetic draft');
  await page.getByRole('navigation',{name:'Business modules'}).getByRole('button',{name:'Governance',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Acceptance & continuance',exact:true})).toBeVisible();
  await page.goBack();
  await expect(page.getByLabel('Legal entity name')).toHaveValue('Synthetic draft');
  await page.getByRole('button',{name:'Clear draft',exact:true}).click();
  await expect(page.getByLabel('Legal entity name')).toHaveValue('');
});
test('protected risk submission requires confirmation and displays server authorization errors',async({page})=>{
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  await page.route('**/api/v1/engagements/*/risks',route=>route.fulfill({status:403,json:{error:{message:'Forbidden'}}}));
  await page.goto('/?module=Governance&view=risks');
  await page.getByLabel('Local development access token').fill('synthetic-test-token');
  await page.getByLabel('Risk title').fill('Synthetic risk'); await page.getByLabel('Risk description').fill('Synthetic description');
  await page.getByRole('button',{name:/Review create risk/i}).click();
  await expect(page.getByRole('heading',{name:'Confirm engagement submission'})).toBeVisible();
  await page.getByRole('button',{name:'Confirm and submit'}).click();
  await expect(page.getByRole('alert')).toContainText('does not allow');
  await page.screenshot({path:'test-results/ui-modules-desktop.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:'test-results/ui-modules-mobile.png',fullPage:true});
});
test('journal posting reviews protected lines and binds the loaded optimistic version',async({page})=>{
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  const journal={id:'journal-a',reference:'SYNTHETIC-1',memo:'Acceptance fixture',status:'DRAFT',version:3};
  let posted:unknown;
  await page.route('**/api/v1/engagements/*/adjustments**',async route=>{
    const request=route.request();
    if(request.method()==='POST') { posted=request.postDataJSON(); await route.fulfill({json:{...journal,status:'POSTED'}}); }
    else if(request.url().endsWith('/journal-a')) await route.fulfill({json:{...journal,lines:[{accountCode:'1000',debit:'10.000000',credit:'0.000000'},{accountCode:'2000',debit:'0.000000',credit:'10.000000'}]}});
    else await route.fulfill({json:[journal]});
  });
  await page.goto('/?module=Fieldwork&view=adjustments');
  await page.getByLabel('Local development access token').fill('synthetic-token');
  await page.getByRole('button',{name:'Load records',exact:true}).click();
  await page.getByRole('button',{name:'Review posting',exact:true}).click();
  await expect(page.getByRole('region',{name:'Journal lines for decision'})).toContainText('Exact journal version 3');
  await expect(page.getByRole('region',{name:'Journal lines for decision'})).toContainText('10.000000');
  expect(posted).toBeUndefined();
  await page.getByRole('button',{name:'Record decision',exact:true}).click();
  await expect(page.getByText('Decision recorded on the engagement.',{exact:true})).toBeVisible();
  expect(posted).toEqual({expectedVersion:3});
});
test('lifecycle decisions expose only the commands returned by the server',async({page})=>{
  await page.route('**/api/v1/identity/config',route=>route.fulfill({json:{provider:'development'}}));
  let command:Record<string,unknown>|undefined;
  await page.route('**/api/v1/engagements/*/lifecycle',async route=>{
    if(route.request().method()==='POST') command=route.request().postDataJSON();
    await route.fulfill({json:{state:'FIELDWORK_EXECUTION',version:4,permittedCommands:['SUBMIT_FOR_REVIEW'],history:[]}});
  });
  await page.goto('/?module=Governance&view=lifecycle');
  await page.getByLabel('Local development access token').fill('synthetic-token'); await page.getByRole('button',{name:'Load records',exact:true}).click();
  await page.getByRole('button',{name:'Review workflow transition'}).click();
  await expect(page.getByLabel('Permitted workflow command').getByRole('option')).toHaveCount(2);
  await page.getByLabel('Permitted workflow command').selectOption('SUBMIT_FOR_REVIEW'); await page.getByLabel('Transition reason').fill('Ready for reviewer');
  await page.getByRole('button',{name:'Record decision',exact:true}).click();
  await expect(page.getByText('Decision recorded on the engagement.',{exact:true})).toBeVisible(); expect(command).toMatchObject({command:'SUBMIT_FOR_REVIEW',expectedVersion:4});
});
