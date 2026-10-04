import { test, expect } from '@playwright/test';
import { moduleScreens } from '../../apps/web/src/module-catalog.js';
test('every module workspace renders with clear authority boundaries and mobile containment', async ({page}) => {
  test.setTimeout(60_000);
  await page.route('**/api/v1/identity/config', route => route.fulfill({json:{provider:'development'}}));
  for (const screen of moduleScreens) {
    await page.goto(`/?module=${screen.module}&view=${screen.id}`);
    await expect(page.getByRole('navigation',{name:'Module workspaces'}).getByRole('button',{name:screen.title,exact:true})).toHaveAttribute('aria-current','page');
    await expect(page.locator('main h1')).toBeVisible();
    if (!screen.endpoint && screen.fields.length > 0 && screen.id!=='trial-balance') await expect(page.getByText('Preparation only',{exact:true})).toBeVisible();
    await page.setViewportSize({width:390,height:844});
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),screen.id).toBe(true);
  }
});
test('Practice expenses creates and posts a classified journal through the real API boundary', async ({page}) => {
  await page.route('**/api/v1/identity/config', route => route.fulfill({json:{provider:'development'}}));
  const ids = { expense:'10000000-0000-4000-8000-000000000001', cash:'10000000-0000-4000-8000-000000000002', payable:'10000000-0000-4000-8000-000000000003', period:'10000000-0000-4000-8000-000000000005', journal:'10000000-0000-4000-8000-000000000006' };
  const ledger = {currency:'QAR',accounts:[
    {id:ids.expense,code:'500',name:'Office rent',kind:'EXPENSE',active:true,posting:true},
    {id:ids.cash,code:'100',name:'Cash',kind:'ASSET',active:true,posting:true},
    {id:ids.payable,code:'210',name:'Accrued expenses',kind:'LIABILITY',active:true,posting:true},
  ],periods:[{id:ids.period,startsOn:'2026-01-01',endsOn:'2026-12-31',closed:false,version:1,lastTransitionReason:''}],journals:[],balances:[]};
  const journal = {id:ids.journal,periodId:ids.period,accountingDate:'2026-10-04',reference:'EXP-E2E-1',memo:'[OFFICE_RENT_FACILITIES] October rent',status:'DRAFT',version:1,postedAt:null,reversalOf:null,lines:[]};
  let draftRequest: unknown; let postRequest: unknown;
  await page.route('**/api/v1/engagements/*/practice**', async route => {
    const request=route.request(); const url=new URL(request.url());
    if(request.method()==='POST' && url.pathname.endsWith('/expenses/drafts')) { draftRequest=request.postDataJSON(); await route.fulfill({json:journal}); }
    else if(request.method()==='POST' && url.pathname.endsWith(`/journals/${ids.journal}/post`)) { postRequest=request.postDataJSON(); await route.fulfill({json:{...journal,status:'POSTED',version:2,postedAt:'2026-10-04T00:00:00.000Z'}}); }
    else await route.fulfill({json:ledger});
  });
  await page.goto('/?module=Practice&view=expenses');
  await page.getByLabel('Local development access token').fill('synthetic-practice-token');
  await page.getByRole('button',{name:'Load accounts'}).click();
  await expect(page.getByRole('heading',{name:'New recognition entry'})).toBeVisible();
  await page.getByLabel('Category').selectOption('OFFICE_RENT_FACILITIES');
  await page.getByLabel('Accounting period').selectOption(ids.period);
  await page.getByLabel('Accounting date').fill('2026-10-04');
  await page.getByLabel('Reference').fill('EXP-E2E-1');
  await page.getByLabel('Amount · QAR').fill('1250.25');
  await page.getByLabel('Classification account').selectOption(ids.expense);
  await page.getByLabel('Counterpart account').selectOption(ids.payable);
  await page.getByLabel('Description').fill('October rent');
  await page.getByRole('button',{name:'Create journal draft'}).click();
  await expect(page.getByRole('heading',{name:'Expense journal draft created'})).toBeVisible();
  expect(draftRequest).toMatchObject({category:'OFFICE_RENT_FACILITIES',amount:'1250.25',debitAccountId:ids.expense,creditAccountId:ids.payable});
  await page.getByRole('button',{name:'Post through firm policy'}).click();
  await expect(page.getByText('Expense journal posted through approved policy, period, and balance controls.')).toBeVisible();
  expect(postRequest).toMatchObject({expectedVersion:1});
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
