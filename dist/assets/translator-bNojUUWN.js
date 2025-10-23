async function r(t,a="en"){return(await(await ai.translator.create({model:"gemini-nano"})).translate({text:t,to:a})).text}export{r as t};
