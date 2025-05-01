import CoreModule from '../CoreModule'
import Helpers from '../../common/Helpers'
import I18n from '../../i18n'

import styles from './styles.lazy.scss'
import Sheet from '../../common/Sheet'
import { lsKeys } from '../../common/Constants'
import AvailableFeatures from '../../common/AvailableFeatures'
import TooltipManager from '../../common/TooltipManager'

const {$} = Helpers

const MODULE_KEY = 'resourceBars'

const makeEnergyBarHTML = ({type, timeForSinglePoint, timeOnLoad, iconClass, currentVal, max, shortcutLink}) => {
    const {GT} = window
    return `
        <div class="energy_counter" type="${type}" id="canvas_${type}_energy">
            <div class="energy_counter_bar">
                <div class="energy_counter_icon"><span class="${iconClass}"></span></div>
                <a href="${Helpers.getHref(shortcutLink)}">
                    <div class="bar-wrapper">
                        <div class="bar red" style="width:${100 * Math.min(currentVal, max) / max}%"></div>
                        <div class="over">
                            <div class="energy_counter_amount">
                                <span energy>${currentVal}</span>/<span rel="max">${max}</span>
                            </div>
                            <span rel="count_txt" timeforsinglepoint="${timeForSinglePoint}" ${currentVal >= max ? 'style="display:none;"' : `timeonload="${timeOnLoad}"`}>
                                ${GT.design.more_in} <span rel="count"></span>
                            </span>
                        </div>
                    </div>
                </a>
            </div>
        </div>
    `
}

const CIRCULAR_THRESHOLDS = {
    1: 'green',
    0.5: 'yellow',
    0.2: 'red'
}

class ResourceBarsModule extends CoreModule {
    constructor() {
        super({
            baseKey: MODULE_KEY,
            label: I18n.getModuleLabel('config', MODULE_KEY),
            default: true
        })
        this.label = I18n.getModuleLabel.bind(this, MODULE_KEY)

        this.activeBoosters = {}
    }

    shouldRun() {
        return !Helpers.isCurrentPage('messenger')
    }

    run() {
        if (this.hasRun || !this.shouldRun()) {return}

        styles.use()

        Helpers.defer(() => {
            this.injectCSSVars()
            this.betterXP()
            this.betterMoney()
            this.initTooltips()
            const energyBarSelector = Helpers.isCurrentPage('season-arena') ? '#season_battle_user_block_kiss_energy' : '.energy_counter[type="fight"] .energy_counter_icon'
            Helpers.doWhenSelectorAvailable(energyBarSelector, () => {
                this.addEnergyBarShortcut()
                this.addAdditionalBars()
            })
            this.addPoPTimer()
            this.addBoosterStatus()
            this.overrideGlitter()

            const xpObserver = new MutationObserver(() => {this.betterXP()})
            xpObserver.observe($('[hero=xp]')[0], {childList: true})

            const moneyObserver = new MutationObserver(() => {this.betterMoney()})
            moneyObserver.observe($('[hero=soft_currency]')[0], {childList: true})

            // Catch late tooltip inits
            const {init} = window
            if (window.init) {
                const actualInit = init
                window.init = () => {
                    actualInit()
                    this.initTooltips()
                }
            }
        })

        this.hasRun = true
    }

    injectCSSVars() {
        Sheet.registerVar('challenge-token-icon', `url("${Helpers.getCDNHost()}/pictures/design/league_points.png")`)
    }

    initTooltips() {
        const {Hero} = window.shared ? window.shared : window
        const {format_time_short} = window.shared ? window.shared.timer : window
        const {GT} = window
        const types = {
            quest: 'hudEnergy_mix_icn',
            fight: 'hudBattlePts_mix_icn',
            kiss: 'hudKiss_mix_icn',
            challenge: 'hudChallenge_mix_icn, .energy_counter .energy_challenge_icn',
            worship: 'hudWorship_mix_icn',
            reply: 'energy_reply_icn'
        }

        Object.entries(types).forEach(([type, icon]) => {
            const attribute = `energy-${type}-tooltip`
            // prevent default tooltip
            $(`[${attribute}]`).removeAttr(attribute)
            const selector = `.energy_counter .${icon}`

            TooltipManager.initTooltipType(selector, () => {
                let text
                if (Hero.energies[type].amount >= Hero.energies[type].max_regen_amount)
                    text = `<span class="orange">${GT.design.Full}</span>`
                else {
                    let fullIn = Hero.c[type].getTotalRemainingTime()
                    // temp fix due to the game using the wrong max
                    const regen_rate = Hero.energies[type].seconds_per_point
                    if (fullIn > Hero.energies[type].max_regen_amount * regen_rate) {
                        fullIn -= regen_rate * (Hero.energies[type].max_amount - Hero.energies[type].max_regen_amount)
                    }
                    const now = Math.round(new Date().getTime() / 1000)
                    const fullAt = now + fullIn
                    const formattedDate = `<span class="orange">${new Date(fullAt * 1000).toLocaleTimeString(I18n.getLang(), {hour: '2-digit', minute: '2-digit'})}</span>`
                    const formattedIn = `${GT.design.full_in}<span class="orange" rel="timer">${format_time_short(fullIn)}</span>`
                    text = `${formattedIn}<br/>${this.label('fullAt', {time: formattedDate})}`
                }
                return {title: '', body: text}
            })
        })

        // catch any late default tooltips
        const observer = new MutationObserver(() => {
            Object.keys(types).forEach(type => {
                const attribute = `energy-${type}-tooltip`
                if ($(`[${attribute}]`).length) {
                    $(`[${attribute}]`).removeAttr(attribute)
                }
            })
        })
        observer.observe(document.documentElement, {childList: true, subtree: true})
    }

    betterXP() {
        const {Hero} = window.shared ? window.shared : window
        const {HH_MAX_LEVEL, GT} = window
        const $wrapper = $('[rel=xp] .bar-wrapper .over')
        if (!this.$xpContainer) {
            this.$xpContainer = $('<span class="scriptXPContainer"></span>')
            $wrapper.append(this.$xpContainer)
        }

        const {level, left, cur, max} = Hero.infos.Xp
        let leftText
        let maxText = GT.design.Max
        if (level < HH_MAX_LEVEL) {
            leftText = this.label('xp', {xp: I18n.nThousand(left)})
            maxText = I18n.nThousand(max)
        }

        this.$xpContainer.text(`${I18n.nThousand(cur)} / ${maxText}${leftText ? ` (${leftText})` : ''}`)
        $wrapper.addClass('hideDefault')
    }

    betterMoney() {
        if (!this.$moneyContainer) {
            this.$moneyContainer = $('<span class="scriptMoneyContainer" tooltip></span>')
            $('[hero=soft_currency]').after(this.$moneyContainer)
        }

        const {Hero: {currencies: {soft_currency}}} = window.shared ? window.shared : window
        let displayAmount
        const thousandSeparatedMoney = I18n.nThousand(soft_currency)

        if (soft_currency >= 1e6) {
            displayAmount = I18n.nRounding(soft_currency, 3, 0)
            this.$moneyContainer.text(displayAmount).attr('hh_title', thousandSeparatedMoney)
        } else {
            this.$moneyContainer.text($('[hero=soft_currency]').text()).attr('hh_title', thousandSeparatedMoney)
        }

    }

    addEnergyBarShortcut() {
        let shortcutLink
        const questStatus = Helpers.lsGet(lsKeys.QUEST_STATUS)
        const {current_adventure, adventures} = questStatus
        const {questing: {current_url}} = adventures[current_adventure]
        const sidequestStatus = Helpers.lsGet(lsKeys.SIDEQUEST_STATUS)

        if (current_url.includes('quest')) {
            shortcutLink = current_url
        } else if (Object.keys(adventures).some(adventure => parseInt(adventure) !== current_adventure && adventures[adventure]?.questing?.current_url?.includes('quest'))) {
            shortcutLink = '/adventures.html'
        } else if (sidequestStatus && sidequestStatus.energySpendAvailable && sidequestStatus.continueLink) {
            shortcutLink = sidequestStatus.continueLink
        } else if (sidequestStatus && sidequestStatus.energySpendAvailable) {
            shortcutLink = '/side-quests.html'
        } else {
            shortcutLink = '/champions-help.html'
        }

        $('.energy_counter[type=quest] .bar-wrapper').wrap(`<a href="${Helpers.getHref(shortcutLink)}"></a>`)
    }

    addAdditionalBars() {
        const {Hero} = window.shared ? window.shared : window
        const {createEnergyTimer} = window.shared ? window.shared.timer : window
        const barTypes = [
            {type: 'kiss', feature: 'seasons', iconClass: 'hudKiss_mix_icn', shortcutLink: '/season-arena.html'},
            {type: 'challenge', feature: 'leagues', iconClass: 'hudChallenge_mix_icn', shortcutLink: '/leagues.html'},
            {type: 'worship', feature: 'pantheon', iconClass: 'hudWorship_mix_icn', shortcutLink: '/pantheon.html'},
        ]

        let $elemToAppendAfter = $('header .energy_counter[type=fight]')

        barTypes.forEach(({type, feature, iconClass, shortcutLink}) => {
            if (!AvailableFeatures[feature] || !Hero.energies[type]) {
                const $dummySpacer = $(`<div class="script-bar-spacer" type="${type}" id="canvas_${type}_energy"></div>`)
                $elemToAppendAfter.after($dummySpacer)
                $elemToAppendAfter = $dummySpacer
                return
            }

            const {amount, max_regen_amount, seconds_per_point, next_refresh_ts} = Hero.energies[type]

            const $barHTML = $(makeEnergyBarHTML({type, iconClass, shortcutLink, currentVal: amount, max: max_regen_amount, timeForSinglePoint: seconds_per_point, timeOnLoad: next_refresh_ts}))

            $elemToAppendAfter.after($barHTML)
            $elemToAppendAfter = $barHTML

            if (amount < max_regen_amount) {
                if (!Hero.c) {
                    Hero.c = {}
                }

                const selector = `.energy_counter[type="${type}"]`
                const addTimer = () => {
                    Hero.c[type] = createEnergyTimer($(selector))
                    Hero.c[type].startTimer()
                }
                addTimer()

                if (type === 'challenge' && !Helpers.isCurrentPage('leagues.html')) {
                    window.can_battle_in_leagues = false
                }
            }

        })
    }

    addPoPTimer() {
        if (!AvailableFeatures.pop) {return}
        const {createBarTimer, format_time_short} = window.shared ? window.shared.timer : window
        const times = Helpers.lsGet(lsKeys.TRACKED_TIMES)

        let popEndIn = 0
        let popDuration = 1
        let formattedDate

        if (times && times.pop) {
            const {server_now_ts} = window
            popEndIn = Math.max(times.pop - server_now_ts, 0)
            popDuration = times.popDuration
            formattedDate = `<span class=&quot;orange&quot;>${new Date(times.pop * 1000).toLocaleTimeString(I18n.getLang(), {hour: '2-digit', minute: '2-digit'})}</span>`
        }

        const inProgress = popEndIn > 0
        const barWidth = inProgress ? 100 * (popDuration - popEndIn) / popDuration : 100

        const $barHTML = $(`
            <a class="script-pop-timer" href="${Helpers.getHref('/activities.html?tab=pop')}">
                <div class="hh_bar" ${inProgress ? `tooltip="${this.label('readyAt', {time: formattedDate})}"` : ''}>
                    <div class="text">${inProgress ? this.label('popsIn', {time: `<span>${format_time_short(popEndIn)}</span>`}) : this.label('popsReady')}</div>
                    <div class="backbar borderbar">
                        <div class="frontbar ${inProgress ? 'pinkbar' : 'bluebar'}" style="width: ${barWidth}%"></div>
                    </div>
                </div>
            </a>
        `)

        $('header .currency').before($barHTML)

        if (popEndIn > 0) {
            const onComplete = (state) => {
                state.$bar_parent_element.show()

                $barHTML.find('.text').text(this.label('popsReady'))
                $barHTML.find('.pinkbar').addClass('bluebar').removeClass('pinkbar')
            }

            if (window.shared) {
                createBarTimer($barHTML, popEndIn, popDuration, {onComplete: onComplete}).startTimer()
            } else {
                const oldMobileCheck = window.is_mobile_size
                window.is_mobile_size = () => false
                createBarTimer($barHTML, popEndIn, popDuration, {onComplete: onComplete}).startTimer()
                window.is_mobile_size = oldMobileCheck
            }
        }
    }

    addBoosterStatus() {
        const {server_now_ts} = window
        const boosterStatus = Helpers.lsGet(lsKeys.BOOSTER_STATUS) || {normal: [], mythic: []}
        const slotCount = {normal: 4, mythic: 5}

        boosterStatus.normal = boosterStatus.normal.filter(({endAt}) => endAt > server_now_ts)

        Object.keys(boosterStatus).forEach(key => {
            if (boosterStatus[key].length < slotCount[key]) {
                // fill the rest with empty
                boosterStatus[key] = [...boosterStatus[key], ...Array(slotCount[key] - boosterStatus[key].length).fill({empty: true})]
            }
        })

        const $boosterStatusHTML = $(`<a class="script-booster-status" href="${Helpers.getHref('/shop.html?type=player-stats&subtab=booster')}"><div class="script-boosters normal"></div><div class="script-boosters mythic"></div></a>`)

        const buildNormalSlot = (data) => {
            const {empty, id_item, ico, identifier, rarity, endAt} = {...data, ...data.item}
            if (empty) {
                return $('<div class="slot empty"></div>')
            }
            const {server_now_ts} = window
            data.expiration = endAt - server_now_ts
            const formattedDate = new Date(endAt * 1000).toLocaleTimeString(I18n.getLang(), {hour: '2-digit', minute: '2-digit'}).replace(/(\d)/g, (x) => `${x}<i></i>`)
            return $(`
                <div class="slot ${rarity}" id_item="${id_item}" booster-item-tooltip data-d="${JSON.stringify(data).replace(/"/g, '&quot;')}" additional-tooltip-info="${JSON.stringify({additionalText: `<span class="script-tooltip"></span>${this.label('endAt', {time: formattedDate})}`}).replace(/"/g, '&quot;')}">
                    <img src="${ico || `${Helpers.getCDNHost()}/pictures/items/${identifier}.png`}"/>
                </div>`)
        }
        const buildMythicSlot = (data) => {
            const {empty, id_item, ico, identifier} = {...data, ...data.item}
            if (empty) {
                return $('<div class="slot mythic empty"></div>')
            }
            return $(`
                <div class="slot mythic" id_item="${id_item}" booster-item-tooltip data-d="${JSON.stringify(data).replace(/"/g, '&quot;')}" additional-tooltip-info="${JSON.stringify({additionalText: '<span class="script-tooltip"></span>'}).replace(/"/g, '&quot;')}">
                    <img src="${ico || `${Helpers.getCDNHost()}/pictures/items/${identifier}.png`}"/>
                </div>
            `)
        }
        const buildProgressWrapper = (current, max, useTimer) => {
            const percentage = Math.min(current / max, 1)
            const firstHalf = Math.min(percentage, 0.5) * 2
            const secondHalf = Math.max(percentage - 0.5, 0) * 2

            let colorClass = ''
            let flashingClass = ''

            if (percentage > 0) {
                Object.entries(CIRCULAR_THRESHOLDS).forEach(([threshold, className]) => {
                    if (percentage <= threshold) {
                        colorClass = className
                    }
                })

                if (percentage <= 0.0035) {
                    flashingClass = 'flashing'
                }
            }

            const $wrapper = $(`
                <div class="circular-progress">
                    <div class="circle">
                        <div class="circle-bar left ${flashingClass}">
                            <div class="progress ${colorClass}" style="transform: rotate(${180 * secondHalf}deg)"></div>
                        </div>
                        <div class="circle-bar right ${flashingClass}">
                            <div class="progress ${colorClass}" style="transform: rotate(${180 * firstHalf}deg)"></div>
                        </div>
                        ${useTimer ? '<div class="dummy-timer-target" style="display: none;"></div>' : ''}
                    </div>
                </div>
            `)

            if (useTimer) {
                const {createTimer, format_time_short} = window.shared ? window.shared.timer : window
                const onComplete = () => {
                    $wrapper.find('.slot')
                        .attr('class', 'slot empty')
                        .empty()
                        .attr('data-d', '').removeAttr('data-d')
                        .attr('tooltip-id', '').removeAttr('tooltip-id')
                        .attr('id_item', '').removeAttr('id_item')
                    $wrapper.find('.progress').css('transform', 'rotate(0deg)')
                }
                const onUpdate = (state) => {
                    const remainingTime = state.time_remaining

                    // Doesn't update after first viewing the tooltip...
                    const $slot = $wrapper.find('.slot')
                    let slot_data = JSON.parse($slot.attr('data-d'))
                    slot_data.expiration = remainingTime
                    $slot.attr('data-d', JSON.stringify(slot_data))

                    // so, update the tooltip if being viewed
                    const $booster_tooltip = $('.script-booster-status-item')
                    if ($booster_tooltip.length && $wrapper.is(':hover')) {
                        $booster_tooltip.find('.item-duration-time').text(format_time_short(remainingTime))
                    }

                    const percentage = remainingTime / max
                    const firstHalf = Math.min(percentage, 0.5) * 2
                    const secondHalf = Math.max(percentage - 0.5, 0) * 2

                    if (percentage > 0) {
                        Object.entries(CIRCULAR_THRESHOLDS).forEach(([threshold, className]) => {
                            if (percentage <= threshold) {
                                colorClass = className
                            }
                        })

                        if (percentage <= 0.0035) {
                            flashingClass = 'flashing'
                        }
                    }

                    if (flashingClass) {
                        $wrapper.find('.left, .right').addClass(flashingClass)
                    }

                    const $left = $wrapper.find('.left .progress')
                    const $right = $wrapper.find('.right .progress')
                    $left.css('transform', `rotate(${180 * secondHalf}deg)`).attr('class', `progress ${colorClass}`)
                    $right.css('transform', `rotate(${180 * firstHalf}deg)`).attr('class', `progress ${colorClass}`)
                }
                createTimer($wrapper.find('.dummy-timer-target'), current, {onComplete: onComplete, onUpdate: onUpdate}).startTimer()
            }

            return $wrapper
        }
        const buildSlotAndAddTooltip = (buildSlot, data, replaceEmpty) => {
            const {empty, id_member_booster_equipped, usages_remaining, endAt, item} = data
            const {rarity, default_usages, duration} = item || {}
            const $slot = buildSlot(data)
            let current = 0
            let max = 1
            let useTimer = false
            const isMythic = empty ? $slot.hasClass('mythic') : rarity === 'mythic'

            if (!empty) {
                if (isMythic) {
                    current = usages_remaining
                    max = default_usages
                } else {
                    let normalisedDuration = duration == 1440 ? 86400 : duration
                    current = endAt - server_now_ts
                    max = normalisedDuration
                    useTimer = true
                }
            }

            if (useTimer) {
                const {format_time_short} = window.shared ? window.shared.timer : window
                // Correct timer when viewing tooltip
                $slot.on('mouseenter', () => {
                    if (!$slot.hasClass('empty')) {
                        const slot_data = JSON.parse($slot.attr('data-d'))

                        // wait for tooltip to be made
                        setTimeout(() => {
                            const $booster_tooltip = $('.script-booster-status-item')
                            if ($booster_tooltip.length) {
                                $booster_tooltip.find('.item-duration-time').text(format_time_short(slot_data.expiration))
                            }
                        }, 1)
                    }
                })
            }
            const $progressWrapper = buildProgressWrapper(current, max, useTimer)
            $progressWrapper.prepend($slot)

            if (replaceEmpty) {
                $boosterStatusHTML.find(`.circular-progress:has(.empty${isMythic ? '.mythic' : ':not(.mythic)'})`).first().replaceWith($progressWrapper)
            } else {
                $boosterStatusHTML.find(`.script-boosters.${isMythic ? 'mythic' : 'normal'}`).append($progressWrapper)
            }

            if (!empty && isMythic) {
                const id_m_i = id_member_booster_equipped
                this.activeBoosters[id_m_i] = $progressWrapper
            }
        }

        
        
        boosterStatus.normal.forEach(data => {
            buildSlotAndAddTooltip(buildNormalSlot, data)
        })
        boosterStatus.mythic.forEach(data => {
            buildSlotAndAddTooltip(buildMythicSlot, data)
        })

        $('header .currency').before($boosterStatusHTML)

        $(document).on('boosters:equipped', (event, {id_item, isMythic, new_id}) => {
            const boosterStatus = Helpers.lsGet(lsKeys.BOOSTER_STATUS) || {normal: [], mythic: []}

            const newBoosterData = boosterStatus[isMythic ? 'mythic' : 'normal'].find(data => parseInt(data.id_item) === parseInt(id_item) && (new_id && parseInt(data.id_member_booster_equipped) === parseInt(new_id)))

            if (newBoosterData) {
                const $slotToReplace = $boosterStatusHTML.find(`.slot.empty${isMythic ? '.mythic' : ':not(.mythic)'}`)
                if ($slotToReplace.length) {
                    buildSlotAndAddTooltip(isMythic ? buildMythicSlot : buildNormalSlot, newBoosterData, true)
                } else {
                    // wat
                    console.log('somehow equipped a new equip but have no empty slot????')
                }
            } else {
                console.log('can\'t find data in LS for new booster with id', new_id, 'and itemid', id_item)
            }
        })

        $(document).on('boosters:updated-mythic', () => {
            const boosterStatus = Helpers.lsGet(lsKeys.BOOSTER_STATUS) || {normal: [], mythic: []}

            const boostersByIdmi = {}
            boosterStatus.mythic.forEach(data => boostersByIdmi[data.id_member_booster_equipped] = data)

            Object.entries(this.activeBoosters).forEach(([id_m_i, $elem]) => {
                const updatedData = boostersByIdmi[id_m_i]

                if (!updatedData) {
                    // Booster has expired
                    $elem.find('.slot').attr('class', 'slot mythic empty').empty().attr('data-d', '').attr('tooltip-id', '').attr('id_item', '')
                    $elem.find('.progress').css('transform', 'rotate(0deg)')
                } else {
                    const {item: {default_usages}, usages_remaining} = updatedData
                    const percentage = Math.min(usages_remaining / default_usages, 1)
                    const firstHalf = Math.min(percentage, 0.5) * 2
                    const secondHalf = Math.max(percentage - 0.5, 0) * 2
                    let colorClass = 'green'

                    if (percentage > 0) {
                        Object.entries(CIRCULAR_THRESHOLDS).forEach(([threshold, className]) => {
                            if (percentage <= threshold) {
                                colorClass = className
                            }
                        })
                    }

                    const $left = $elem.find('.left .progress')
                    const $right = $elem.find('.right .progress')
                    $left.css('transform', `rotate(${180 * secondHalf}deg)`).attr('class', `progress ${colorClass}`)
                    $right.css('transform', `rotate(${180 * firstHalf}deg)`).attr('class', `progress ${colorClass}`)
                    const $slot = $elem.find('.slot')
                    $slot.attr('data-d', JSON.stringify(updatedData))
                    $slot.data('d', updatedData)
                }
            })
        })

        new MutationObserver(() => {
            // Nasty hack. Wish there was a better way of setting a custom class on a tooltip
            $('.hh_tooltip_new:has(.script-tooltip)').addClass('script-booster-status-item')
        }).observe(document.body, {childList: true})
    }

    overrideGlitter() {
        const {glitter_me} = window.shared ? window.shared.animations : window
        const {is_mobile_size} = window.shared ? window.shared.general : window

        const glitter_me_hook = (field) => {
            const is_mobile_sized = is_mobile_size()
            glitter_me(field)

            let x, y, w, h
            switch (field) {
            case 'soft_currency':
                if (is_mobile_sized) {
                    x = 780
                    y = 14
                    w = 100
                    h = 30
                } else {
                    x = 800
                    y = 6
                    w = 90
                    h = 30
                }
                break
            case 'hard_currency':
                if (is_mobile_sized) {
                    x = 780
                    y = 38
                    w = 100
                    h = 30
                } else {
                    x = 800
                    y = 20
                    w = 90
                    h = 30
                }
                break
            case 'energy_quest':
                if (is_mobile_sized) {
                    x = 240
                    y = 10
                    w = 80
                    h = 60
                } else {
                    x = '150px'
                    y = '8px'
                    w = 90
                    h = 40
                }
                break
            case 'energy_battle':
                if (is_mobile_sized) {
                    x = 340
                    y = 10
                    w = 80
                    h = 60
                } else {
                    x = 270
                    y = 8
                    w = 90
                    h = 40
                }
                break
            case 'xp':
                if (is_mobile_sized) {
                    x = 0
                    y = 0
                    w = 1040
                    h = 14
                } else {
                    x = 0
                    y = 0
                    w = 1040
                    h = 14
                }
                break
            default:
                return
            }

            const $glitter = $('.glitter-svg').last()
            const old_w = parseInt($glitter.attr('width'))
            const old_h = parseInt($glitter.attr('height'))

            $glitter.css('left', x)
            $glitter.css('top', y)
            $glitter.attr('width', w)
            $glitter.attr('height', h)
            if (w != old_w || h != old_h) {
                const size_coef = h < 30 ? 0.6 : (h > 100 ? 2 : 1)
                const old_size_coef = old_h < 30 ? 0.6 : (old_h > 100 ? 2 : 1)

                $glitter.find('>g>g').each((i, el) => {
                    const transform = $(el).attr('transform')
                    const translations = transform.match(/translate\(([^)]+)\)/)[1].split(',').map(n => parseFloat(n))
                    translations[0] *= w / old_w
                    translations[1] *= h / old_h
                    const old_scale = parseFloat(transform.match(/scale\(([^)]+)\)/)[1])
                    const scale = old_scale * (size_coef / old_size_coef)

                    $(el).attr('transform', transform.replace(/translate\(([^)]+)\)/, `translate(${translations.join(',')})`).replace(/scale\(([^)]+)\)/, `scale(${scale})`))
                })
            }
        }

        if (window.shared) {
            window.shared = {
                ...window.shared,
                animations: {
                    ...window.shared.animations,
                    glitter_me: glitter_me_hook
                }
            }
        } else {
            window.glitter_me = glitter_me_hook
        }
    }
}

export default ResourceBarsModule
